//  ui1.js
//    First UI for Kudocracy, test/debug UI, HTTP based
//
// Jun 11 2014 by @jhr, extracted from main.js


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
  this.visitor         = null;
  this.filter          = "";
  this.filter_tags     = [];
  this.filter_str_tags = []; // As strings, includes "computed" tags
  this.sort_criterias  = [];
  this.current_page    = [];
  this.previous_page   = [];
  this.proposition     = null;
  return this;
};


Session.prototype.is_local = function(){
  return this.ip === "127.0.0.1";
};


Session.prototype.has_filter = function(){
  return !!this.filter.length;
};


Session.prototype.filter_tags_label = function( separator ){
// Return separated list of tags extracted from filter, # are removed, trimmed
// Return "" if no filter
  var text = this.filter;
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
  return text.replace( /#/g, "" );
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
  if( text ){

    var with_abuses = false;
    var tags = [];
    var tag_entity;
    var topic;
    var sort_criterias = [];

    // Sanitize, filter out weird stuff
    this.filter = text.replace( /[^+\-A-Za-z0-9_ ]/g, "" );
    
    // Handle "all" pseudo filter
    if( this.filter === "all" ){
      this.filter = "";
    
    // Handle normal stuff, if anything remains, ie space separated things
    }else if( this.filter ){ 

      var buf = [];
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
          
        // Existing tags
        }else if( tag_entity = Topic.find( '#' + tag ) ){
          if( with_abuses || !tag_entity.is_abuse() ){
            if( tags.indexOf( tag_entity ) === -1 ){
              buf.push( '#' + tag );
              tags.push( tag_entity );
            }
          }

        // Computed tags
        }else if( Topic.reserved( tag ) ){
          if( buf.indexOf( "#" + tag ) === -1 ){
            buf.push( "#" + tag );
            if( tag === "abuse" ){
              with_abuses = true;
            }
          }

        // Tags that are names of existing topics
        }else if( topic = Topic.find( tag ) ){
          if( buf.indexOf( "#" + tag ) === -1 ){
            if( with_abuses || !topic.is_abuse() ){
              buf.push( "#" + tag );
            }
          }
        }

      });
      if( buf.length ){
        this.filter = ( " " + buf.join( " " ) + " " ).replace( /  /g, " " );
      }else{
        this.filter = "";
      }
      this.with_abuses = with_abuses;
      this.filter_str_tags = buf;
      this.filter_tags = tags;
      this.sort_criterias = sort_criterias;
      return this.filter;
    }
  }else{
    this.filter = "";
  }
  if( !this.filter ){
    this.filter = "";
    this.filter_str_tags = [];
    this.filter_tags = [];
    this.sort_criterias = [];
    this.with_abuses = false;
  }
  return this.filter;
};


Session.prototype.source = function(){
  return ( this.filter + " " + this.sort_criterias.join( " " ) ).trim(); 
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
      link_to_command( "help" ),link_to_page( "index" ),
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
  trace( "URL: " + req.url );
  var parsed_url = url.parse( req.url, true );
  var query = req.post_query_data || parsed_url.query;
  PendingResponse.query = query;
  // Either /?i= style "or /xxx/yyy/zzz style
  if( !query || !query.i ){
    return decodeURIComponent( parsed_url.pathname.replace( /\//g, " " ).trim() )
    || "page index";
  }
  // Collect ?i=...&i2=...&i3... into space separated command + arg list
  var data = query.i;
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
    }
    return data.substring( 0, req.method === "GET" ? 140 : 100000 );
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
  groups:       page_groups,
  proposition:  page_proposition,
  propositions: page_propositions,
  tags:         page_propositions,
  votes:        page_votes,
  ballots:      page_ballots
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
  var head = null;
  var body = null;
  var result;
  try{
    result = f.apply( this, arguments );
    head = result[ 0 ];
    body = result[ 1 ];
    if( Array.isArray( head ) ){
      head = head.join( "" );
    }
    if( Array.isArray( body ) ){
      body = body.join( "" );
    }
    Session.current.previous_page = Session.current.current_page;
    Session.current.current_page  = as_array( arguments );
  }catch( err  ){
    trace( "Page error", name, err, err.stack );
  }
  set_head( head );
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


function redirect( page ){
// Set HTTP response to 302 redirect, to redirect to specified page
  if( !PendingResponse )return;
  var query_style = true;
  var r;
  if( query_style ){
    if( !page ){
      r = "?i=/";
    }else{
      // Note: / does not need encoding, and it's ugly when encoded
      r = "?i=/page/" + querystring.escape( page )
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
  PendingResponse.redirect = r;
}


function redirect_back( n, text ){
// Set HTTP response to 302 redirect, to redirect to the page from where the
// current HTTP request is coming.
  if( !Session.current.current_page )return redirect( "propositions" );
  var target = Session.current.current_page.slice( 0, ( n || 1 )  );
  // When going back to page persona or page visitor, add the name
  if( n === 1
  && ( target[0] === "persona" || target[0] === "visitor" )
  ){
    target.push( Session.current.current_page[1] );
  }
  if( text ){ target.push( text ); }
  redirect( target.join( "/" ) );
}


/*
 *  <a href="...">links</a>
 */

function link_to_command( cmd, title ){
  var url_code = querystring.escape( cmd );
  return '<a href="?i=' + url_code + '">' + ( title || cmd ) + '</a>';
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
  if( page === "index"){
    value = '<strong>Kudo<em>c</em>racy</strong>';
  }
  if( !value ){ value = page; }
  page = encode_ref( page );
  return '<a href="?i=/page/' + page + "/" + url_code + '">'
  + (title || value)
  + '</a>';
}


function link_to_persona_page( persona ){
  if( !persona )return "";
  if( typeof persona === "string" ){
    return link_to_page( "persona", persona );
  }
  var title
  = persona === Session.current.visitor
  ? "you"
  : persona.label;
  return link_to_page( "persona", persona.label, title );
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
  left =  link_to_page( "index" )
  + " " + link_to_page( "propositions" )
  + " " + link_to_page( "tags" )
  + " " + link_to_page( "votes" )
  + " " + link_to_page( "ballots" )
  + ( left ? " " + left : "" );
  if( Session.current.visitor ){
    right = ( (right && (right + " ")) || "" )
    + link_to_page(
      Session.current.visitor.label,
      "visitor",
      Session.current.visitor.label
    );
  }else{
    right = ( (right && (right + " ")) || "" )
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
        ( (right && (right + " ")) || "" ) + link_to_page( "help" ),
      '</div>',
    '</div></div><br><br>',
    '<div id="container" style="margin:0.5em;"><div id="content" ><div id="content_text">',
    ''
  ].join( "\n" );
}


function page_footer(){
  var duration = l8.update_now() - Session.current.timestamp;
  return [
    '\n</div></div></div><div class="" id="footer"><div id="footer_content">',
    link_to_page( "propositions", "", "propositions" ), " ",
    link_to_page( "tags", "", "tags" ),
    '<div id="powered"><a href="https://github.com/virteal/kudocracy">',
    '<img src="http://simpliwiki.com/yanugred16.png"/>',
    '<strong>kudo<em>c</em>racy</strong>',
    '</a> <dfn>' + duration + ' ms</dfn></div>',
    '</div></div>',
    '<script>!function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0],p=/^http:/.test(d.location)?"http":"https";if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src=p+"://platform.twitter.com/widgets.js";fjs.parentNode.insertBefore(js,fjs);}}(document, "script", "twitter-wjs");</script>',
  ].join( "" );
}


function vote_menu( vote, proposition, orientation, with_twitter ){
  function o( v, l ){
    return '\n<option value="' + v + '">' + ( l || v ) + '</option>';
  }
  var with_comment = "";
  // vote is either a vote or a persona
  var vote_id;
  if( vote.type === "Vote" ){
    vote_id = vote.id;
    proposition = vote.proposition;
    with_comment = true;
  }else{
    vote_id = "" + vote.id + "." + proposition.id;
  }
  var comment = null;
  var size = 20;
  if( with_comment ){
    with_comment = '<input type="search" autofocus name="comment" ';
    comment = Comment.valid( vote.comment() );
    if( comment ){
      comment = comment.text;
      size = comment.length + 1;
      with_comment += 'placeholder="' + Wiki.htmlizeAttr( comment ) + '"';
    }else{
      with_comment += 'placeholder="comment"';
    }
    if( size !== 20 ){
      if( size > 100 ){ size = 100; }
      with_comment += ' size="' + size + '" ';
    }
    with_comment += '/> ';
  }
  var tags = proposition
  .tags_string( Session.current.visitor, Session.current.with_abuses )
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
  return [
    '\n<form name="vote" url="/">',
    '<input type="hidden" name="i" value="change_vote"/>',
    '<input type="hidden" name="vote_id" value="' + vote_id + '"/>',
    with_comment,
    '<select name="orientation">',
    // ToDo: randomize option order?
    o( "", "orientation" ), o( "agree"), o( "disagree" ), o( "protest" ), o( "blank" ), o( "neutral" ),
    '</select>',
    '<select name="privacy">',
    o( "", "privacy" ), o( "public"), o( "secret" ), o( "private" ),
    '</select>',
    '<select name="duration">',
    o( "", "duration" ), o( "one year"), o( "one month" ), o( "one week" ),
    o( "24 hours" ), o( "one hour"), o( "expire" ),
    '</select>',
    ' <input type="submit" value="Vote"/>',
    '</form>\n',
    // Twitter tweet button
    (!with_twitter ? "" :
      '<a href="https://twitter.com/intent/tweet?button_hashtag='
      + (proposition.is_tag()
        ? proposition.label.substring( 1 )
        : proposition.label )
      + '&hashtags=kudocracy,vote,'
      + (vote.type !== "Vote"
        ? (orientation && orientation + "," || "")
        : vote.orientation() + ","
        )
      + tags.replace( / /g, "," ).replace( /#/g, "")
      + '&text=' + comment
      + '" class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet ' + proposition.label + '</a>'
    )
  ].join( "" );
}


function delegate_menu( delegation ){
  function o( v, l ){
    return '\n<option value="' + v + '">' + (v || l) + '</option>';
  }
  return [
    '\n<form name="delegation" url="/">',
    '<input type="hidden" name="i" '
      + 'value="change_delegation &' + delegation.id + '"/>',
    '<select name="privacy">',
    o( "", "privacy" ), o( "public"), o( "secret" ), o( "private" ),
    '</select>',
    ' <select name="duration">',
    o( "", "duration" ), o( "one year"), o( "one month" ), o( "one week" ),
    o( "24 hours" ), o( "one hour"), o( "expire" ),
    '</select>',
    ' <input type="submit" value="Delegate"/>',
    '</form>\n',
    // Twitter tweet button
    '\n<a href="https://twitter.com/intent/tweet?button_hashtag='
    + delegation.agent.label.substring( 1 )
    + '&hashtags=kudocracy,vote,'
    + delegation.tags_string().replace( / /g, "," ).replace( /#/g, "")
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
  return this;
};


ProtoTagSet.add_proposition = function( proposition, functor, tag_page ){
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
  for( label in this.tags ){
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


ProtoTagSet.string = function(){
  return this.array().join( " " );
};


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
      count = '<dfn>(' + tag_entity.propositions().length + ')</dfn> ';
    }
    buf.push( link_to_page( page || "propositions", tag, tag ) + count );
  });
  buf.push( '</div>' );
  return found ? buf.join( "" ) : "";
}


function filter_and_sort_menu( can_propose, tag_page ){
  
  function o( v, l ){
    return '\n<option value="' + v + '">' + ( l|| v ) + '</option>';
  }
  
  function o2( v, l, m ){
    var reversed = v[0] === "-";
    if( reversed ){
      v = v.substring( 1 );
    }
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
    return o( ( reversed ? "-" : "+" ) + v, "by " + l ) 
    + o( ( reversed ? "+" : "-" ) + v, " --- " + more );
  }
  
  var tags_label = Session.current.filter_tags_label();
  
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
  && Session.current.visitor
  && Session.current.has_filter()
  && Session.current.filter.indexOf( " #but " ) === -1
  ){
    propose_clause = ' <input type="submit" name="i2" value="Propose"/>';
  }
  
  var delegate_clause = "";
  if( false && can_propose
  && Session.current.visitor
  && Session.current.has_filter()
  ){
    delegate_clause = ' <input type="submit" name="i2" value="Delegate"/>';
  }
  
  return [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="i" value="proposition_action"/>',
    '<input type="search" placeholder="tags" autosave="filter" autofocus name="i3" value="',
      tags_label,
    '"/> ',
    '<select name="i4" onchange=',
      '"if( this.value !== 0 ){ ',
        'this.form[0].value = \'proposition_action Search\';',
        'this.form.submit();',
      '}">',
      o( "", "sort" ),
      o2( "age_modified",  "last activity date", "old first" ),
      o2( "name",          "proposition name" ),
      o2( "age",           "creation date", "old first" ),
      o2( "-heat",          "relevance (heat)", "cold first" ),
      o2( "-activity",      "global activity" ),
      o2( "-changes",       "vote activity"),
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
    '</select>',
    ' <input type="submit" name="i2" value="Search"/>',
    delegate_clause,
    propose_clause,
    '</form>\n'
  ].join( "" );
}


function filter_change_links( tag_set ){
  var buf2 = [ '<br>' ];
  var old_filter = " " + Session.current.source() + " ";
  // #computed.... #tag... #tag(1) #persona... #persona(1)...
  tag_set.sort( function( a, b ){
    var entity_a = Topic.find( a );
    var entity_b = Topic.find( b );
    // not computed tags come next
    if( entity_a ){
      // tags that are the name of persona come next
      if( Persona.find( "@" + entity_a.name.substring( 1 ) ) ){
        a = "zzzzzzzzz" + a;
      }else{
        a = "zzzz" + a; 
      }
      // tags with single proposition come last
      if( entity_a.propositions().length <= 1 ){
        a = "zzzz" + a;
      }
    }
    if( entity_b ){
      if( Persona.find( "@" + entity_b.name.substring( 1 ) ) ){
        b = "zzzzzzzzz" + b;
      }else{
        b = "zzzz" + b;
      }
      if( entity_b.propositions().length <= 1 ){
        b = "zzzz" + b;
      }
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
      // buf2.push( link_to_command( "filter_more " + label, "&#10062;") );
    }else{
      buf2.push( link_to_command( "filter_less " + label, "&#9989;" ) );
    }
    var tag_entity = Topic.find( label );
    if( tag_entity ){
      buf2.push( link_to_command(
        ( filtered ? "filter_less " : "filter_more " ) + label,
        label + '<dfn>(' + tag_entity.propositions().length + ')</dfn>'
      ) );
    }else{
      buf2.push( link_to_command(
        ( filtered ? "filter_less " : "filter_more " ) + label,
        label
      ) );
    }
    buf2.push( " " );
  });
  if( buf2.length > 1 ){
    buf2.push( '<br>' );
  }
  return buf2.join( "" );
}


function push_title_and_search_form( buf, title ){
  var tag_page = ( title === "Tags" );
  buf.push( '<br><h3>' + title + '</h3>' );
  var filter_label = Session.current.filter_tags_label();
  if( filter_label ){
    buf.push( ' tagged <h1>'
      + filter_label.replace( /#/g, "" )
      + '</h1><br>'
    );
    var persona_tag = Persona.find( Session.current.filter.replace( "#", "@" ).trim() );
    if( persona_tag ){
      buf.push( link_to_page( "persona", persona_tag.name ) + '<br>' );
    }
    var tag_topic = Topic.find( Session.current.filter.trim() );
    var comment = Topic.reserved_comment( Session.current.filter.trim() );
    if( comment ){
      buf.push( '<dfn>' + comment + '</dfn><br><br>' );
    }else if( comment = tag_topic && Comment.valid( tag_topic.comment() ) ){
      buf.push( '' + format_comment( comment.text ) + '<br><br>' );
    }else{
      buf.push( '<br><br>' );
    }
  }else{
    buf.push( '<h1> </h1><br><br><br>' );
  }

  // Twitter tweet button, to tweet about the filter
  if( false && Session.current.has_filter() ){
    buf.push( '<a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy'
      + '&hashtags=vote,'
      + Session.current.filter_tags_label( "," )
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet #kudocracy</a>'
    );
  }

  // Query to search for tags or create a proposition
  buf.push( filter_and_sort_menu( true, tag_page ) );
  
  // Build a list of all seen tags
  var tag_set = new TagSet();
  tag_set.add_session( Session.current );
  
  // Place holder for clickable list of tags, to alter filter
  tag_set.insert_index = buf.length;
  buf.push( "" );
  buf.push( '<hr>' );
  
  return tag_set;
  
}


/* ---------------------------------------------------------------------------
 *  page visitor
 */

function page_visitor( page_name, name, verb, filter ){
// The private page of a persona
  var persona = ( name && Persona.find( name ) ) || Session.current.visitor;
  if( !persona )return [ _, "Persona not found: " + name ];

  if( filter ){
    filter = slice( arguments, 3 ).join( " " );
  }
  filter = Session.current.set_filter( filter || (verb === "Search" && "all" ) );

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      link_to_twitter_user( persona.label ),
      link_to_page( persona.label, "delegations" )
      + " " + link_to_page( persona.label, "persona", "public" )
    ) ]
  ];
  var buf = [];

  buf.push( '<h1>' + persona.label + '</h1><br><br>' );

  // Query to filter for tags
  buf.push( filter_label( filter, "propositions" ) );
  buf.push( filter_and_sort_menu() );

  // Sort votes, recent first unless some other criteria about propositions
  var sort_criterias = Session.current.sort_criterias;
  var votes = persona.votes();
  votes = votes.sort( function( a, b ){
    if( !sort_criterias )return b.time_touched - a.time_touched;
    return Ephemeral.compare_measures( a.proposition, b.proposition, sort_criterias );
  });
  buf.push( '<br><div><h2>Votes</h2>' );

  votes.forEach( function( entity ){

    if( !entity.filtered( Session.current.filter, Session.current.visitor ) )return;

    buf.push( '<br><br>'
      + ' ' + link_to_page( "proposition", entity.proposition.label ) + ' '
      //+ "<dfn>" + emojied( entity.proposition.result.orientation() ) + '</dfn>'
      + '<br><em>' + emojied( entity.orientation() ) + "</em> "
      + "<dfn>(" + entity.privacy() + ")</dfn>"
      + ( entity.is_direct()
        ? ""
        :  "<dfn>(via " + link_to_page( "persona", entity.agent_label() ) + ")</dfn>" )
      + ", for " + duration_label( entity.expire() - Kudo.now() )
      + vote_menu( entity, _, _, true ) // With twitter button
    );

  });
  buf.push( "</div><br>" );

  // Delegations
  var delegations = persona.delegations();
  if( delegations.length ){
    
    buf.push( '<div><h2>Delegations</h2> - '
      + link_to_page( "delegations", "", "change" )
      + '<br>'
    );
    //buf.push( "<ol>" );
  
    delegations.forEach( function( entity ){
  
      if( !entity.filtered( Session.current.filter, Session.current.visitor ) )return;
  
      buf.push( '<br>' // "<li>"
          + link_to_persona_page( entity.agent )
          //+ ' <small>' + link_to_twitter_user( entity.agent.label ) + '</small> '
          + ( entity.is_inactive() ? " <dfn>(inactive)</dfn> " :  " " )
          + link_to_page( "propositions", entity.filter_string( persona ) )
          //+ ' <small>' + link_to_twitter_filter( entity.filter_string( persona ) ) + '</small>'
          + "</li>"
      );
    });
  
  }

  // Footer
  buf.push( "</div><br>" );
  buf.push( page_footer() );
  r[1] = r[1].concat( buf );
  return r;
}


/* ---------------------------------------------------------------------------
 *  page persona
 */
 
function page_persona( page_name, name, verb, filter ){
// This is the "public" aspect of a persona
  var persona = Persona.find( name );
  if( !persona )return [ _, "Persona not found: " + name ];

  if( filter ){
    filter = slice( arguments, 3 ).join( " " );
  }
  filter = Session.current.set_filter( filter || (verb === "Search" && "all" ) );

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      link_to_twitter_user( persona.label ),
      ( Session.current.visitor === persona
        ?   " " + link_to_page( "delegations" )
          + " " + link_to_page( persona.label, "visitor", "votes" )
        : _ )
    ) ]
  ];
  var buf = [];

  buf.push( '<h1>' + persona.label + '</h1><br><br>' );

  // Twitter follow button
  buf.push(
    '<a href="https://twitter.com/' + persona.label
    + '" class="twitter-follow-button" data-show-count="true">'
    + 'Follow ' + persona.label + '</a>'
  );

  // Query to filter for tags in persona's votes
  buf.push( filter_label( filter ) );
  buf.push( filter_and_sort_menu() );

  var sort_criterias = Session.current.sort_criterias;
  // Votes, recent first unless some other criteria about propositions
  var votes = persona.votes();
  votes = votes.sort( function( a, b ){
    if( !sort_criterias.length )return b.time_touched - a.time_touched;
    return Ephemeral.compare_measures( a.proposition, b.proposition, sort_criterias );
  });
  buf.push( '<br><br><div><h2>Votes</h2><br>' );
  //buf.push( "<ol>" );

  votes.forEach( function( vote ){

    if( !vote.filtered( Session.current.filter, Session.current.visitor ) )return;

    buf.push( '<br>' ); // "<li>" );
    if( vote.is_private() ){
      buf.push( "private" );
    }else{
      buf.push( ''
        +  ( vote.is_secret()
          ? "secret"
          : "<em>" + emojied( vote.orientation() ) ) + "</em> "
        + '' + link_to_page( "proposition", vote.proposition.label ) + ' '
        + " <dfn>" + time_label( vote.time_touched ) + "</dfn> "
        //+ " <dfn>" + emojied( entity.proposition.result.orientation() ) + "</dfn> "
        //+ time_label( entity.proposition.result.time_touched )
        //+ "<dfn>(" + entity.privacy() + ")</dfn>"
        + ( vote.is_direct()
          ? ""
          :  "<dfn>(via " + link_to_page( "persona", vote.agent_label() ) + ")</dfn> " )
        //+ ", for " + duration_label( entity.expire() - Kudo.now() )
      );
    }
    //buf.push( "</li>" );
  });

  // buf.push( "</ol></div><br>" );
  buf.push( '</div><br>' );
  buf.push( page_footer() );
  r[1] = r[1].concat( buf );
  return r;
  
} // page_persona()


/* ---------------------------------------------------------------------------
 *  page delegations
 */

function page_delegations( page_name, name, verb, filter ){
// The private page of a persona's delegations

  var persona = ( name && Persona.find( name ) ) || Session.current.visitor;
  if( !persona )return [ _, "Persona not found: " + name ];

  if( filter ){
    filter = slice( arguments, 3 ).join( " " );
  }
  filter = Session.current.set_filter( filter || (verb = "Search" && "all" ) );

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      link_to_twitter_user( persona.label ),
      link_to_page( persona.label, "persona", "public" )
      + " " + link_to_page( persona.label, "visitor", "votes" )
    ) ]
  ];
  var buf = [];

  buf.push( '<h1>' + persona.label + '</h1><br><br>' );

  // Query to filter for tags
  buf.push( filter_label( filter, "propositions" ) );
  buf.push( [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="i" value="page delegations ' + persona.label + '"/>',
    '<input type="search" placeholder="tags" name="i3" value="',
      Session.current.filter_tags_label(),
    '"/>',
    ' <input type="submit" name="i2" value="Search"/>',
    '</form><hr><br>\n'
  ].join( "" ) );

  // Delegations
  var delegations = persona.delegations();
  buf.push( "<div><h2>Delegations</h2>" );
  
  buf.push([ '<br>',
    '\n<form name="delegation" url="/">',
    '<input type="hidden" name="i" value="set_delegation"/>',
    'agent <input type="text" name="i2" value="@" placeholder="@someone"/>',
    ' tags <input type="text" name="i3" value="#" placeholder="#tag #tag2 #tag3..."/>',
    ' <input type="submit" value="Delegate"/>',
    '</form><br>\n'
  ].join( "" ) );

  delegations.forEach( function( entity ){

    if( !entity.filtered( Session.current.filter, persona ) )return;

    buf.push( '<br><br>'
      + link_to_persona_page( entity.agent )
      + ( entity.is_inactive() ? " <dfn>(inactive)</dfn> " :  " " )
      + link_to_page( "propositions", entity.filter_string( persona ) )
      + "<br><dfn>(" + entity.privacy() + ")</dfn>"
      + ", for " + duration_label( entity.expire() - Kudo.now() )
    + delegate_menu( entity )
    );
  });

  // Footer
  buf.push( "</div><br>" );
  buf.push( page_footer() );
  r[1] = r[1].concat( buf );
  return r;

} // page_delegations()


/* ---------------------------------------------------------------------------
 *  page_groups()
 */
 
function page_groups( page_name, name ){
  var r = [ page_style(), null ];
  var persona = Persona.find( name );
  if( !persona ){
    r[1] = "Persona not found: " + name;
    return r;
  }
  r[1] = pretty( persona.value() );
  return r;
}


/* ---------------------------------------------------------------------------
 *  page propositions
 */
 
function page_propositions( page_name, filter ){
// This is the main page of the application, either a list of tags or
// propositions, filtered.

  var tag_page = page_name === "tags";
  
  // Parse filter
  if( filter ){
    filter = slice1( arguments ).join( " " );
  }
  filter = Session.current.set_filter( filter );
  
  // Change #new into #hot if there is no persona logged in
  var persona = Session.current.visitor;
  if( !persona && filter === " #new " ){
    filter = Session.current.set_filter( "hot" );
  }
  
  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      Session.current.has_filter()
      ? link_to_twitter_tags( Session.current.filter )
      : _,
      _
    ) ]
  ];
  var buf = [];

  // Title + list of tags
  var tag_set = push_title_and_search_form( buf, tag_page ? "Tags" : "Propositions" );

  // Display list of matching propositions or tags
  var propositions = Topic.all;
  var list = [];
  var count = 0;
  var attr;
  var entity;
  var visitor_tag = null;
  if( Session.current.visitor ){
    visitor_tag = "#" + Session.current.visitor.label.substring( 1 );
  }

  for( attr in propositions ){
    
    entity = propositions[ attr ];
    
    // Apply filter
    if( !Topic.valid( entity ) )continue;
    if( entity.is_tag() ){
      if( !tag_page )continue;
    }else{
      if( tag_page )continue;
    }
    if( !entity.filtered( Session.current.filter, persona ) )continue;

    // Filter out propositions without votes unless current user created it
    // or #orphan filter
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
  
  var sort_criterias = Session.current.sort_criterias;
  if( !sort_criterias.length ){
    sort_criterias = [ "+heat" ];
  }
  list = list.sort( function( a, b ){
    // The last consulted proposition is before all the others
    if( a === Session.current.proposition )return -1;
    if( b === Session.current.proposition )return 1;
    return Ephemeral.compare_measures( a, b, sort_criterias );
  });

  // Display sorted matching propositions
  list.forEach( function( proposition ){

    var text = proposition.label;
    if( tag_page ){
      text += " is a good tag";
    }else{
      text = "#" + text;
    }
    
    // Emoji orientation + link to proposition
    buf.push(
      '<br><h2>' + emoji( proposition.result.orientation() )
      + link_to_page( "proposition", proposition.label, text )
      + '</h2> '
    );
    
    // List of tags
    //buf.push( '<br>' );
    tag_set.add_proposition( proposition, function( tag, label ){
      buf.push( link_to_page( page_name, tag, label ) );
      buf.push( " " );
    }, tag_page );
    
    //buf.push( '<small>' + link_to_twitter_tags( proposition.tags_string() + '</small><br>' ) );
    buf.push( '<br>' + proposition_summary( proposition ) + '<br>' );

    // If tag, display link to tagged propositions
    if( tag_page ){
      buf.push( "" + proposition.propositions().length + " "
        + link_to_page( "propositions", proposition.label, "propositions" ) + "<br>"
      );
    }

    if( Session.current.visitor ){
      var vote_entity = Vote.find( Session.current.visitor.name + "." + proposition.name );
      if( vote_entity ){
        buf.push( 'you: '
          + vote_entity.orientation()
          + " <dfn>(" + vote_entity.privacy() + ")</dfn>"
          + ( vote_entity.is_direct()
            ? ""
            :  "<dfn>(via " + link_to_page( "persona", vote_entity.agent_label() ) + ")</dfn>" )
          + ", for " + duration_label( vote_entity.expire() - Kudo.now() )
        );
        buf.push( vote_menu( vote_entity ) );
      }else{
        buf.push( vote_menu( Session.current.visitor, proposition ) );
      }
      buf.push( '<br>' );
    }
  });

  // Change default filter if nothing was displayed
  if( !count ){
    if( Session.current.filter === " #new " ){
      Session.current.set_filter( "hot" );
      redirect( tag_page ? "tags" : "propositions" );
    }else if( Session.current.filter === " #hot " ){
      Session.current.set_filter( "recent" );
      redirect( tag_page ? "tags" : "propositions" );
    }else if( Session.current.filter === " #recent " ){
      Session.current.set_filter( "" );
      redirect( tag_page ? "tags" : "propositions" );
    }
  }
  
  // Inject list of all seen tags
  buf[ tag_set.insert_index ] = filter_change_links( tag_set );
  
  buf.push(  "<br>" + page_footer() );
  r[1] = r[1].concat( buf );
  return r;
  
} // page_propositions()


/* ---------------------------------------------------------------------------
 *  page ballots
 */

function page_ballots( pagename, query ){
// This page let's visitor ask for results about tags by specified personas

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      _,
      _
    ) ]
  ];
  var buf = [];

  // Title + list of tags
  var tag_set = push_title_and_search_form( buf, "Ballots" );
  
  // Query for names and tags
  query = slice1( arguments ).join( " " );
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
  
  // if no tags or no personas, find some
  if( ( !tags.length && !personas.length && Session.current.has_filter() )
  ||  ( tags.length  && !personas.length )
  ){
    
    var filter = !tags.length && Session.current.filter;
    var added_personas = {};
    
    // Collect topics that match the filter && the voters
    var topic_name;
    var topics = Topic.all;
    // Unless some topics were specified
    if( tags.length ){
      topics = {};
      tags.forEach( function( tag ){
        topics[ tag.name ] = tag;
      } );
    }
    var topic;
    for( topic_name in topics ){
      
      topic = topics[ topic_name ];
      
      if( filter ){
        if( !Topic.valid( topic ) )continue;
        // Skip propositions with less than 1 vote, ie orphan/errors/noise
        // ToDo: less than 2 votes?
        if( filter && topic.result.total() < 1 )continue;
        // Skip problematic/abusive propositions
        if( topic.result.orientation() === Vote.protest )continue;
        // Skip "neutral" propositions, useless
        if( topic.result.orientation() === Vote.neutral )continue;
        // Skip non matching propositions
        if( filter && !topic.filtered( filter ) )continue;
        tags.push( topic ); 
      }
      
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
      
    } // end of topics
    
    // Rebuild query using selected tags and personas
    valid_query = "";
    tags.forEach( function( tag ){
      valid_query += tag.label + " ";
    });
    personas.forEach( function( persona ){
      valid_query += persona.label + " ";
    });
    // Avoid infinite loop, clear the filter
    if( !valid_query && filter ){
      Session.current.set_filter( "" );
    }
    valid_query = date.toISOString() + " " + valid_query;
    
    return page_ballots( pagename, valid_query );  
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
  .replace( "T", " ")
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
  buf.push( [
    '\n<form name="ballots" method="POST" url="/">',
    '<input type="hidden" value="page ballots" name="i"/>',
    '<textarea name="i2" autofocus cols=40 rows="' + ( 6 + tags.length + personas.length )
    + '">\n',
    Wiki.htmlize( valid_query ),
    '\n</textarea>',
    '<br><input type="submit" value="Results"/>',
    '</form><br>\n'
  ].join( "" ) );
  
  var time_limit = date.getTime();
  
  tags.forEach( function( tag ){
    var total         = 0;
    var count_for     = 0;
    var count_against = 0;
    var count_blanks  = 0;
    var buf2 = [];
    buf.push( '<h3>'
      + link_to_page( "proposition", tag.label, tag.label )
      + '</h3> '
    );
    tag_set.add_proposition( tag );
    personas.forEach( function( persona ){
      var vote = Vote.find( persona.name + "." + tag.name );
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
    buf.push( ''
      + emojied( count_for > count_against ? Vote.agree : Vote.disagree )
      + '<br>for '  + count_for
      + " against " + count_against
      + " blank "   + count_blanks
      + " total "   + total
      + "<br>"
    );
    buf = buf.concat( buf2 );
    buf.push( '<br><br>' );
  });
  
  // Inject list of all seen tags
  buf[ tag_set.insert_index ] = filter_change_links( tag_set );
  
  buf.push( "<br>" + page_footer() );
  r[1] = r[1].concat( buf );
  
  return r;
  
} // page_ballots()


/* ---------------------------------------------------------------------------
 *  page votes
 */

function page_votes( page_name, filter ){
// This is the votes page of the application, filtered.

  var persona = Session.current.visitor;
  
  // Parse filter
  if( filter ){
    filter = slice1( arguments ).join( " " );
  }
  filter = Session.current.set_filter( filter );

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      Session.current.has_filter()
      ? link_to_twitter_tags( Session.current.filter )
      : _,
      _
    ) ]
  ];
  var buf = [];

  var tag_set = push_title_and_search_form( buf, "Votes" );

  // Display list of matching votes
  var votes = Vote.log; // All votes!
  var vote_value;
  var entity;
  var visitor_tag = null;
  if( Session.current.visitor ){
    visitor_tag = "#" + Session.current.visitor.label.substring( 1 );
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
    || !entity.filtered( Session.current.filter, persona )
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
  var sort_criterias = Session.current.sort_criterias;
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
      if( prop_a === Session.current.proposition )return 1;
      if( prop_b === Session.current.proposition )return -1;
      return Ephemeral.compare_measures( prop_a, prop_b, sort_criterias );
    }
    return name_a > name_b ? 1 : -1;
  });
  
  // Display votes
  var last_proposition;
  valid_votes.forEach( function( vote_value ){
    proposition = vote_value.entity.proposition;
    if( last_proposition && proposition !== last_proposition ){
      buf.push( '<br>' );
    }
    last_proposition = proposition;
    buf.push( "<br>" + ( proposition.is_tag() ? "tag " : "" ) );
    buf.push( link_to_page( "proposition", proposition.label ) );
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
    buf.push(
      ' <em>' + emojied( orientation_text ) + "</em> "
      + persona_text
      + " <small><dfn>" + time_label( vote_value.snaptime ) + "</dfn></small>"
    );
    if( vote_value.comment_text ){
      buf.push( ' ' + format_comment( vote_value.comment_text ) );
    }
    // buf.push( "</li>" );
  });

  if( !count ){
    if( Session.current.filter === " #new " ){
      Session.current.set_filter( "hot" );
      redirect( "votes" );
    }else if( Session.current.filter === " #hot " ){
      Session.current.set_filter( "recent" );
      redirect( "votes" );
    }else if( Session.current.filter === " #recent " ){
      Session.current.set_filter( "" );
      redirect( "votes" );
    }
  }

  // Inject list of all seen tags, to alter filter when clicked
  buf[ tag_set.insert_index ] = filter_change_links( tag_set );
  
  buf.push(  "<br><br>" + page_footer() );
  r[1] = r[1].concat( buf );
  return r;
  
} // page_vote()


/* ---------------------------------------------------------------------------
 *  page login
 */

function page_login( page_name ){

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      _,
      _ ) ]
  ];
  var buf = [];

  // Query for name
  buf.push( [
    '\n<form name="login" url="/">',
    '<label>Your twitter @name</label> ',
    '<input type="hidden" name="i" value="login"/>',
    '<input type="text" autofocus name="i2"/>',
    ' <input type="submit" value="Login"/>',
    '</form>\n'
  ].join( "" ) );
  buf.push( "<br>" + page_footer() );
  r[1] = r[1].concat( buf );
  return r;

} // page_login()


/* ---------------------------------------------------------------------------
 *  page index
 */

function page_index(){
  Session.current.clear();
  return [ '<link rel="stylesheet" href="http://simpliwiki.com/style.css" type="text/css">',
  [
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
    '<input type="hidden" name="i" value="page propositions"/>',
    '<input type="search" placeholder="all" name="i1" value="new"/>',
    ' <input type="submit" value="propositions?"/>',
    '</form>\n',
    '</div>',
    '<br><a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy&hashtags=vote&text=new%20democracy" class="twitter-hashtag-button" data-related="Kudocracy,vote">Tweet #kudocracy</a>',
    ' <a href="https://twitter.com/Kudocracy" class="twitter-follow-button" data-show-count="true">Follow @Kudocracy</a>',
    // Twitter buttons
    '<script>!function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0],p=/^http:/.test(d.location)?"http":"https";if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src=p+"://platform.twitter.com/widgets.js";fjs.parentNode.insertBefore(js,fjs);}}(document, "script", "twitter-wjs");</script>',
    //'<div><div><div>' + page_footer()
  ].join( "" ) ];
  
} // page_index()


/* ---------------------------------------------------------------------------
 *  page help
 */

function page_help(){
  var r = [
    page_style(),
    [ ]
  ];
  r[1] = [
    page_header(
      _,
      link_to_twitter_tags( "#kudocracy" ),
      _
    ),
    '<div style="max-width:50em">',
    '<h2>How to..?</h2><br>',
    'See the wiki:' + Wiki.wikify( " HowTo." ),
    '<br>',
    '<br><h2>What is it?</h2><br>',
    'An experimental Liquid Democracy voting system where ',
    'people can ' + emoji( "agree" ) + 'like/'
    + emoji( "disagree" ) + 'dislike hashtags.',
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
    'that people now use all over the world.<br>' +
    'I hope you agree. ',
    '</div>',
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
    '<br><br><h2>Misc</h2><br>',
    'Debug console: ' + link_to_command( "help" ),
    '<br><br>',
    page_footer()
  ];
  return r;
  
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
  agree:    "&#xe00e;",    // Thumb up
  disagree: "&#xe421;",    // Thumb down
  protest:  "&#xe012;"     // raised hand
};


function emojied( text ){
  return text ? emoji( text ) + text : "";
}

/*
 *
 */
 
function proposition_summary( proposition, div ){
  var buf = [];
  function cond_push( label, n, style ){
    if( n ){
      if( style ){
        buf.push( '<' );
        buf.push( style );
        buf.push( '>' );
      }
      buf.push( label );
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
  var comment = proposition.comment();
  if( div ){
    buf.push( '<div><h2>Summary' + ' <em>' + emojied( orientation ) + '</em>'
    //+ ( comment ? '<br>' + format_comment( comment.text ) : "" )
    + '</h2><br>' );
  }else{
    if( comment ){
      buf.push( '<h3>' + format_comment( comment.text ) + '</h3><br>' );
    }
    buf.push( "<em>" + orientation + "</em>. " );
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
  buf.push( '<dfn>change ' + result.count() + ' ' );
  buf.push( time_label( result.time_touched ) + '</dfn>' );
  return buf.join( "" );
}

/*
 *  i18n()
 *  Provisionnal!
 */
 
function i18n( msg ){
  if( msg === "il y a " )return "";
  return msg;
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
        && i18n( "il y a ") + Math.floor( delta )
        + i18n( " seconds")
        || delta < 120
        && i18n( "1 minute")
        || delta < 3600
        && i18n( "il y a ") + Math.floor( delta / 60 )
        + i18n( " minutes")
        || delta < 7200
        && i18n( "about an hour")
        || delta < 86400
        && i18n( "il y a ") + Math.floor( delta / 3600 )
        + i18n( " hours")
        )
      || day_delta == 1
      && i18n( "a day")
      || day_delta < 7
      && i18n( "il y a ") + day_delta
      + i18n( " days")
      || day_delta < 31
      && i18n( "il y a ") + Math.ceil( day_delta / 7 )
      + i18n( " weeks")
      || day_delta >= 31
      && i18n( "il y a ") + Math.ceil( day_delta / 30.5 )
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
  google.load('visualization', '1.0', {'packages':['corechart']});
  google.setOnLoadCallback(drawChart);
  function drawChart(){

    var data;
    var options;

    // Create the data table.
    data = new google.visualization.DataTable();
    data.addColumn('string', 'Orientation');
    data.addColumn('number', 'Slices');
    data.addRows([
      ['agree',    graph_pie.agree],
      ['disagree', graph_pie.disagree],
      ['protest',  graph_pie.protest],
      ['blank',    graph_pie.blank]
    ]);

    // Set chart options
    options = { 'title':'Orientations', 'width':400, 'height':300 };

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
    options.title = "History";
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
  if( !proposition )return [ _, "Proposition not found: " + proposition_name ];
  Session.current.proposition = proposition;
  var persona = Session.current.visitor;
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
    agree: result.agree(),
    disagree: result.disagree(),
    protest: result.protest(),
    blank: result.blank()
  };
  var graph_serie = [ [ proposition.timestamp, 0 ] ];
  var balance = 0;

  // Make body
  var buf = [];

  buf.push( '<h1>' + (is_tag ? "Tag " : "" )
  + emoji( proposition.result.orientation() ) + proposition.label + '</h1><br><br>' );
  
  var comment = proposition.get_comment();
  var author = Persona.valid( comment
    ? comment.vote.persona
    : proposition.persona()
  );
  if( comment || author ){
    buf.push( '<h3>'
    + format_comment( comment ? comment.text : "" )
    + '</h3>'
    + ( author
    ? ' <dfn>(' + link_to_persona_page( author ) + ')</dfn>'
    : "" )
    + '<br><br>' );
  }

  // Twitter tweet button, if proposition and no visitor (else use vote_menu())
  if( false && !is_tag && !Session.current.visitor ){
    buf.push( '<a href="https://twitter.com/intent/tweet?button_hashtag='
      + label
      + '&hashtags=kudocracy,vote,'
      + proposition.tags_string(Session.current.visitor, Session.current.with_abuses )
      .replace( / /g, "," ).replace( /#/g, "")
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet ' + label + '</a>'
    );
  }

  // Summary
  buf.push( '<br><br>' + proposition_summary( proposition, "div" ) + '<br>' );

  if( is_tag ){
    buf.push( "<br>" + proposition.propositions().length + " "
      + link_to_page( "propositions", label, "propositions" ) + "<br>"
    );
  }

  // List of tags, with link to propositions
  buf.push( '<br><h2>Tags</h2><br>' );
  var tmp = proposition.filter_string( persona );
  buf.push( filter_label( tmp, "propositions" ) );
  
  // Add tagging form
  if( Session.current.visitor ){
    buf.push( ['\n<form name="proposition" url="/">',
      '<input type="hidden" name="i" value="proposition_action"/>',
      '<input type="hidden" name="i3" value="' + proposition.label + '"/>',
      '<input type="text" placeholder="tags" name="i4" />',
      ' <input type="submit" name="i2" value="Tag"/>',
      '</form>\n'
    ].join( "" ) );
  }
  buf.push( '<br>' );
  

  // Source, since, age, last change...
  buf.push( '<br><h2>Info</h2><br>' );
  if( tmp = proposition.source() ){
    if( tmp.indexOf( "://" ) !== -1 ){
      tmp = '<a href="' + tmp + '">' + tmp + '</a>';
    }
    buf.push( "<br>source " + tmp  + " " );
  }
  if( tmp = proposition.persona() ){
    buf.push( "by " + link_to_page( "persona", tmp.name, tmp.label ) );
  }
  buf.push( "<br>since " + time_label( proposition.timestamp ) );
  //buf.push( "<br>age " + duration_label( proposition.age() ) );
  buf.push( "<br>last change " + time_label( proposition.time_touched ) );
  
  // Last vote (if public) ToDo: should display secret or private otherwise
  var votes_log = proposition.votes_log() || [];
  if( votes_log.length ){
    var last_vote_value = votes_log[ votes_log.length -1 ];
    buf.push( '<br>last vote ' + time_label( last_vote_value.snaptime ) );
    var last_vote_entity = Vote.valid( last_vote_value.entity );
    var last_vote_persona = Vote.valid( last_vote_entity && last_vote_entity.persona );
    if( last_vote_entity
    &&  last_vote_persona
    &&  last_vote_entity.privacy() === Vote.public
    ){
      buf.push( ' <em>' + emojied( last_vote_entity.orientation() ) + '</em>' );
      buf.push( ' ' + link_to_persona_page( last_vote_persona ) );
      if( last_vote_value.agent_label ){
        buf.push( ' <dfn>(via '
          + link_to_page( agent_label, "persona" )
           + ')</dfn>'
        );
      }
    }
  }

  // End in...
  buf.push( "<br>end in " + duration_label( proposition.expire() - Kudo.now() ) );

  // Votes
  buf.push( '<br><br><h2>Votes</h2><br>' );

  // Vote menu
  if( Session.current.visitor ){
    var vote_entity = Vote.find( Session.current.visitor.name + "." + proposition.name );
    if( vote_entity ){
      buf.push( '<br>you: '
        + '<em>' + emojied( vote_entity.orientation() ) + "</em> "
        + "<dfn>(" + vote_entity.privacy() + ")</dfn>"
        + ( vote_entity.is_direct()
          ? ""
          :  "<dfn>(via " + link_to_page( "persona", vote_entity.agent_label() ) + ")</dfn>" )
        + ", for " + duration_label( vote_entity.expire() - Kudo.now() )
      );
      buf.push( vote_menu( vote_entity, true /* with comment */, _, true /* twitter */ ) );
    }else{
      buf.push( vote_menu( Session.current.visitor, proposition ) );
    }
    buf.push( "<br>" );
  }

  // Graph, pie
  buf.push( '<div id="orientation_chart_div"></div>' );
  buf.push( '<div id="balance_chart_div"></div>' );

  // Votes
  var votes = proposition.votes_log() || [];
  buf.push( "<br><div><h2>Log</h2><br>" );
  //buf.push( "<ol>" );
  var count = 0;
  var gap = false;
  
  votes.forEach( function( vote_value, index ){
    
    if( !vote_value )return;
    
    // Compute balance agree/against
    var was = vote_value.previously;
    var now = vote_value.orientation;
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
      if( vote_value.previously !== Vote.neutral ){
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
          orientation += ' <dfn>(you)</dfn>';
        }
      }else if( vote_value.privacy            === Vote.secret
      || ( valid_vote && valid_vote.privacy() === Vote.secret )
      ){
        orientation += " <dfn>(secret)</dfn>";
        if( valid_vote.persona === persona ){
          orientation += '<dfn>(you)</dfn>';
        }
      }
      var persona_text = "";
      var agent_label;
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
        ' ' + orientation + ' '
        + persona_text
        + " <small><dfn>" + time_label( vote_value.snaptime ) + "</dfn></small>"
      );
      if( vote_value.comment_text ){
        buf.push( ' ' + format_comment( vote_value.comment_text ) );
      }
      // buf.push( "</li>" );
    }
    
  });
  buf.push( "</div><br>" );

  // Footer
  buf.push( page_footer() );

  // Header
  var r = [
    page_style()
    + '<script type="text/javascript" src="https://www.google.com/jsapi"></script>'
    + '<script type="text/javascript">'
    //+ '\nvar proposition = ' + proposition.json_value()
    + '\nvar graph_pie = ' + JSON.stringify( graph_pie )
    + '\nvar graph_serie = ' + JSON.stringify( graph_serie )
    + '\n' + proposition_graphics + '; proposition_graphics();'
    + '</script>',
    [ page_header(
      _,
      link_to_twitter_filter( tag_label ),
      link_to_page( "ballots", proposition.name, "ballots" )
    ) ]
  ];
  r[1] = r[1].concat( buf );
  return r;
  
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
    "proposition_search tags... sort_criterias... -- set session filter",
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

  // ToDo: move this into some page_xxx()
  redirect_back( 2 );

  // Figure out parameters, maybe from pending http query
  var proposition = null;
  var query = PendingResponse.query;

  // Find vote
  var vote_id = query.vote_id;
  if( !vote_entity ){
    if( !vote_id ){
      printnl( "Vote not found" );
      return;
    };
    vote_entity = Vote.find( vote_id );
  }

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
    })[ duration ]
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
  if( !privacy && !orientation && !duration &!comment ){
    printnl( "No change" );
    return;
  }

  // Either a brand new vote
  if( !vote_entity ){
    var idx_dot = vote_id.indexOf( "." )
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
    if( comment ){
      Ephemeral.inject( "Comment", {
        vote: vote_entity,
        text: comment
      });
      printnl( "Comment changed " + pretty( vote_entity ) );
      // If change to comment only, go to page about proposition
      if( !privacy && !duration && !orientation ){
        redirect( "proposition " + vote_entity.proposition.label );
      }
    }
  }
  return;
};

http_repl_commands.set_delegation = function( agent, main_tag ){
  
  redirect_back();
  
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
  
  Ephemeral.inject( "Delegation", {
    persona: persona_entity,
    agent:   agent_entity,
    tags:    tags
  } );
}


http_repl_commands.change_delegation = function( delegation_entity, agent, privacy, duration ){
  
  // ToDo: move this into some page_xxx()
  redirect_back();
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
  if( name.length < 4 )return redirect( "login" );
  var lower_name = name.toLowerCase();
  
  // Create persona if first visit, respect user provided case
  if( !( Session.current.visitor = Persona.find( lower_name ) ) ){
    Ephemeral.inject( "Persona", { label: name } );
    Session.current.visitor = Persona.find( lower_name );
  }
  
  // ToDo: set cookies for SimpliWiki
  
  // Jump back to propositions page
  if( Session.current.filter === "" || Session.current.filter === " #hot " ){
    Session.current.set_filter( "new" );
  };
  if( Session.current.previous_page[0] === "proposition" ){
    Session.current.current_page = Session.current.previous_page;
    redirect_back( 2 );
  }else if( Session.current.previous_page[0] === "propositions" ){
    Session.current.current_page = Session.current.previous_page;
    redirect_back( 2 );
  
  // Or jump to visitor's page
  }else{
    redirect( "visitor" );
  }
};


http_repl_commands.proposition_search = function(){
  var text = as_array( arguments ).join( " " );
  text = Session.current.set_filter( text || "all" );
  Session.current.sort_criterias.forEach( function( criteria ){
    text += criteria + " ";
  })
  redirect_back( 1, text.trim() );
  return;  
};


http_repl_commands.filter_more = function(){
  var text = as_array( arguments ).join( " " );
  text = text + " " + Session.current.source();
  return http_repl_commands.proposition_search( text )
};

http_repl_commands.filter_less = function(){
  var less = as_array( arguments ).join( " " );
  var text = Session.current.source();
  less.split( " " ).forEach( function( label ){
    text = text.replace( label, "" );
  });
  return http_repl_commands.proposition_search( text );
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
  .replace( /[+\-][a-z_]*/, "")
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
  redirect_back();
  return;
}


http_repl_commands.proposition_tagging = function( proposition_name, text ){
  
  var proposition = Topic.find( proposition_name );
  if( !proposition ){
    printnl( "Tagging, invalid proposition: " + proposition_name );
    redirect_back();
    return;
  }
  
  // Redirect visitor to proposition's page once done
  redirect( "proposition " + proposition_name );
  
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
  
  // Until success, assume visitor returns where she was 
  redirect_back();
  
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
    if( !Topic.find( "#" + tag ) )return tag;
    // Don't confuse an existing proposition with a tag
    if( Topic.find( tag ) )return tag;
    tags.push( "#" + tag );
    return ""
  } );

  // Add all tags from the current filter, including those removed earlier
  if( Session.current.has_filter() ){
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
  
  // inject user's name as first tag if "propose"
  if( Persona.valid( Session.current.visitor ) ){
    tags.push( "#" + Session.current.visitor.label.substring( 1 ) );
  }else{
    printnl( "Invalid persona cannot propose" );
    return;
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
  var proposition_name = text;
  if( !proposition_name ){
    printnl( "No proposition name" );
    return;
  }
  redirect( "proposition " + proposition_name );
  
  // Creation of topic or update with addition of tags
  var proposition = Topic.find( proposition_name );
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
  Session.current.proposition = proposition || Topic.find( text );

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
    
  // Search, text is expected to be a space separated list of tags or criterias
  if( name === "Search" ){
    return http_repl_commands.proposition_search( text );
  }

  // Remove sort criterias potential noise
  text = text.replace( /[+\-][a-z_]*/g, "");

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

