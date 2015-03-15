/*
 *  ui1badges.js
 *    to display kudocracy infos into any web page.
 *
 *  Feb 21 2015 by @jhr
 */
 
exports.kudocracyScript = function(){
// This is based on the canonical twitter method
// See https://dev.twitter.com/web/javascript/loading
// Two changes: http instead of https and local domain vs twitter.com
window.kudocracy = (function(d, s, id) {
  var js, fjs = d.getElementsByTagName(s)[0],
    k = window.kudocracy || {};
  if (d.getElementById(id)) return;
  js = d.createElement(s);
  js.id = id;
  js.src = "http://platform.kudocracy.com/widgets.js";
  fjs.parentNode.insertBefore(js, fjs);
  k.r = [];
  k.ready = function(f) {
    k.r.push(f);
  };
 
  return k;
}(document, "script", "kudocracy-wjs"));
};


exports.minimizedKudocracyScript =
"<script>!function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0],p=/^http:/.test(d.location)?'http':'https';if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src=p+'://platform.kudocracy.com/widgets.js';fjs.parentNode.insertBefore(js,fjs);}}(document, 'script', 'twitter-wjs');</script>";


exports.kudocracyProviderScript = function kudocracy_loader(){
// This is the widgets.js file served to the consumer.

  var k = window.kudocracy;
  
  if( !k ){
    console.log( "Welcome to Kudocracy widgets." );
    k = { r: [] };
  }
  
  if( k.init_done ){
    k.schedule();
    return k;
  }
  
  var k2 = function kudocracy( parent ){
    if( !k2.loaded ){
      console.log( "kudocracy, early call, postponed" );
      var args = arguments;
      return k2.ready( function(){
        k2.apply( k2, args );
      })
    }
    console.log( "kudocracy, called" );
    if( !k2.body_rendered ){
      k2.body_rendered = true;
      console.log( "kudocracy, initial body render" );
      k2( document.body );
      return;
    }
    if( !parent ){
      console.log( "kudocracy, body render" );
      parent = document.body;
    }
    var $ = k2.$;
    var vote_buttons = [];
    $(parent).find( "a" ).each( function(){
      var $this = $(this);
      if( $this.hasClass( "kudocracy-vote-button" ) ){
        vote_buttons.push( this );
      }
    });
    vote_buttons.forEach( function( item ){
      k2.render_vote_button( item );
    });
    // return k2;
  };
  
  
  k2.render_vote_button = function( e, force ){
    
    var $ = k2.$;
    var $e = $(e);
    var rendered =  $e.data( "kudocracy-rendered" );
    if( rendered && !force )return k2;
    $e.data( "kudocracy-rendered", "true" );
    
    var count = $e.data( "count" ) || "";
    count = count.replace( /[^a-z]/g, "" ) || "horizontal";
    var twitter = $e.data( "twitter" );
    var title = $e.data( "title" );
    var url = $e.attr( "href" );
    if( count ){
      url += "&count=" + count;
    }
    if( twitter ){
      url 
      += "&twitter=" 
      +  ( twitter.replace( /[^a-z]/g, "" ) || "horizontal" );
    }
    if( title ){
      url += '&title=' + encodeURIComponent( title );
    }
    var classes = "kudocracy-button kudocracy-vote-button";
    var width  = 200 + ( count === "horizontal" ? 55 : 0 );
    if( title === "Kudo" ){
      width = 75;
      count = "none";
      classes += "kudocracy-vote-compact";
    }
    var height = 20;
    if( twitter ){
      // https://dev.twitter.com/web/tweet-button/faq#dimensions
      if( twitter === "none" ){
        width += 55;
      }else if( twitter === "horizontal" ){
        width += 110;
      }else if( twitter === "vertical" ){
        width  += 55;
        height += 42;
      }else{
        twitter = "horizontal";
        width += 110;
      }
    }
    
    classes += " kudocracy-count-" + count;
    
    var iframe = k2.create_element(
      {
        id:      "kudocracy-widget-" + k2.next_id++,
        src:     url.replace( "/vote", "/votebadge" ),
        width:   width,
        height:  height,
        "class": classes,
        title:   "Kudocracy Vote Button"
      },
      {
        "vertical-align": "bottom"
      }
    );
    
    $e.replaceWith( iframe );
    return k2;
  };
  
  k2.create_element = function( attrs, styles, tag ){
    var $ = k2.$;
    if( !tag ){
      tag = "iframe";
    }
    var e = document.createElement( tag );
    if( attrs.id ){
      e.id = attrs.id;
      delete attrs.id;
    }
    if( tag === "iframe" ){
      e.scrolling = "no"
      e.allowtransparency = "true";
      e.setAttribute( "frameBorder", 0 );
      e.setAttribute( "allowTransparency", true );
    };
    if( attrs ){
      for( var attr in attrs ){
        if( !attrs.hasOwnProperty( attr ) )continue;
        e.setAttribute( attr, attrs[ attr ] );
      }
    }
    if( styles ){
      for( var style in styles ){
        if( !styles.hasOwnProperty( style ) )continue;
        e.style[ style ] = styles[ style ];
      }
    }
    return e;
  };
  
  
  k2.load_jquery = function( url ){
    if( k2.loaded || k2.loading )return;
    k2.loading = true;
    k2.busy = true;
    var d = document;
    var script = d.createElement( "script" );
    script.setAttribute( "type", "text/javascript" );
    script.setAttribute(
      "src", url || "http://code.jquery.com/jquery-2.1.3.min.js"
    );
    if( script.readyState ){
      script.onreadystatechange = function(){
        if( this.readyState == 'complete' || this.readyState == 'loaded' ){
          k2.when_jquery_loaded();
        }
      };
    }else{
      script.onload = k2.when_jquery_loaded;
    }
    ( d.getElementsByTagName( "head" )[ 0 ] || d.documentElement )
    .appendChild( script );
  };
  
  
  k2.when_jquery_loaded = function(){
    if( !k2.shared_jquery ){
      k2.$ = window.$;
      k2.$.noConflict( true );
    }
    k2.loading = false;
    k2.loaded  = true;
    k2.busy = false;
    $.ready( k2.ready );
  };
  
  // Set the handler to resize when embedded content asks, once
  k2.message = function( e ){

    window.kudo_message_event = e;
    var $ = k2.$;
    var event_name = e.data[0];
    var data = e.data[1];
    
    console.log( "kudocracy. handle postMessage", event_name );
    
    switch( event_name ){
      
      case "kudo_height":
      break;
      
      case "kudo_scroll":
        window.scrollTo( 0, 0 );
      break;
      
      case "kudo_load":
        k2.open( data );
      break;
    
      case "kudo_script":
        // Run arbitrary javascript code submitted by post message
        eval( data, e );
      break;
    }
    
  };
  
  k2.open = function( href ){
    if( window.kudo_magic_loader ){
      window.kudo_magic_loader( href );
    }else{
      // Tell potential parent frame about that
      if( window.top !== window.self 
      && window.parent 
      && window.parent.postMessage
      ){
        window.parent.postMessage( [ "kudo_load", href ], "*" );
      }else{
        window.open( href, "kudocracy" );
      }
    }
  };
  
  k2.install_message_listener = function(){
    if( !k2.message_listener ){
      k2.message_listener = window.addEventListener( 'message', 
        k2.message,
        false
      );
    }
    return k2.message_listener;
  }
  
  k2.ready = function( f ){
    if( typeof f === "function" ){
      k2.r.push( f );
    }
    if( k2.busy || !k2.loaded )return k2;
    
    k2.busy = true;
    k2.install_message_listener();
    while( k2.r.length ){
      f = k2.r.shift();
      try{
        f.call( k2 );
      }catch( err ){
        console.error( "kudocracy, ready() error on ", f.name, err );
      }
    }
    k2.busy = false;
    return k2;
  };
  
  
  k2.routine = function kudocracy_routine(){
    k2.scheduled = false;
    var k = k2;
    if( !k.init_done ){
      k.init_done = true;
      if( k.$ || k.shared_jquery ){
        console.info( "kudocracy, use specified $" );
        k.shared_jquery = k.$ || k.shared_jquery;
        k.when_jquery_loaded();
      }else{
        var $ = window.$;
        if( !$ ){
          console.info( "kudocracy, loading jquery" );
          k.load_jquery( k.jquery_url );
        }else{
          console.info( "kudocracy, use global $" );
          k.shared_jquery = $;
          k.$ = $;
          k.when_jquery_loaded();
        }
      }
    }
    return k.ready();
  };
  
     
  k2.schedule = function(){
    if( k2.scheduled )return;
    k2.scheduled = true;
    setTimeout( k2.routine, 1 );
  };
  
  
  k2.r = k.r;
  k.r = [];
  k2.r.unshift( k2 );
  k2.next_id = 0;
  k2.schedule();
  window.kudocracy = k2;
  
  return k2;
  
};


exports.widgets_js = function(){
  return "" + exports.kudocracyProviderScript + ";kudocracy_loader();";
};
