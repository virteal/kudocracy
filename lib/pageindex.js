// pageindex.js
//  the main page of the applicationCache
//
// jan 4 2018 by jhr, extracted from ui1core.js


/*
 *  Some global imports
 */

var ui;
var Kudo;
var l8;
var de;
var nde = false;
var trace;
var bug;
var mand;
var assert;
// var value;
// var pretty;
// var _;
var Ephemeral;
var Topic;
var Persona;
// var Vote;
// var Delegation;
// var Comment;
// var Session;
var l;
var icon;


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
  // value   = Kudo.value;
  // pretty  = Kudo.pretty;
  // _       = Kudo._;
  // Ephemeral entities
  Ephemeral  = Kudo.Ephemeral;
  Topic      = Kudo.Topic;
  Persona    = Kudo.Persona;
  // Vote       = Kudo.Vote;
  // Delegation = Kudo.Delegation;
  // Comment    = Kudo.Comment;
  // ui1core stuff
  // Session    = Kudo.Session;
  ui         = Kudo.ui;
  l = ui.l;
  icon = ui.icon;
}


/* ---------------------------------------------------------------------------
 *  page index.
 *  This page is accessible using many urls. It's content changes somehow
 *  depending on what name is used.
 *  'index' is when it is accessed from either / or /page=index.
 *  'offline' is when it is accessed by the browser appcache in order
 *  to build the 'offline' cache used when the browser is offline.
 *  'kudocracy' is when it is accessed because the browser want's to refresh
 *  an old version of the index page, probably delived to it from some cache.
 *  This happens for the / page that is always delivered from the appcache
 *  as per manifest.appcache's logic.
 *  'main' is the name when the page should look like all the other pages,
 *  ie with the same style, header, footer, etc...
 */
 
function page_index( page_name ){
  
  var nuit_debout = true;
  
  var session = this.session;
  
  var magic = session.magic_loader;
  
  // When "main", the normal stylesheet is used
  var is_main = ( page_name === "main" ) || magic;
  
  var authentic_twitter_id
  = session.authentic && session.visitor.id.substring( 1 );

  var domain = session.domain;
  var searching_domains 
  = Ephemeral.Machine.current === Ephemeral.Machine.main
  && session.filter.indexOf( " #domain ") !== -1;
  
  // Restore some default session value for session configuration
  if( !authentic_twitter_id ){
    session.set_visitor( null );
    if( !is_main && arguments.length === 1 ){
      // session.set_domain();
      session.is_slim = false;
    }
  }
  
  if( !is_main ){
    session.is_app = false;
    session.app_init_done = false;
    session.page_init_done = false;
    session.is_novice = true;
    session.set_current_page( [""] ); // aka /
    session.proposition = null;
    session.agent = null;
  }
  
  // Domains menu, not in "main" page however
  var menu = "";
  if( !is_main ){
    
    // Look for running machines/domains
    var domains = Ephemeral.Machine.all;
    var current_machine = Ephemeral.Machine.current;
    
    // Domain info are stored in the main ephemeral machine
    Ephemeral.Machine.main.activate();
    
    var valid_machines = [];
    domains.forEach( function( machine ){
      // Skip current machine
      if( machine === current_machine )return;
      // Skip main machine
      if( machine === Ephemeral.Machine.main )return;
      var persona = Persona.find( "@" + machine.owner );
      if( !persona )return;
      var persona_topic = persona.get_topic();
      if( !persona_topic )return;
      if( persona_topic.is_abuse() )return;
      valid_machines.push( machine.id || ui.get_config().domain );
    });
    
    valid_machines = valid_machines.sort( function( a, b ){
      return a > b ? -1 : 1;
    });
    
    // Add an option to search using kudocracy itself, if #domain exists
    var domain_topic = Topic.find( "#domain" );
    if( domain_topic ){
      if( !domain_topic.result.is_win() ){
        domain_topic = null;
      }else{
        valid_machines.unshift( "Search #domain" );
      }
    }
    
    // Add the main machine if it is not the current one
    if( Ephemeral.Machine.main !== current_machine ){
      valid_machines.unshift( ui.get_config().domain );
    }
    
    // First option in menu is current domain, noop
    valid_machines.unshift( domain || ui.get_config().domain );
    
    if( valid_machines.length > 1 ){
      
      var menu_list = new ui.Builder();
      var after_menu = ui.avatar( domain || ui.get_config().domain, 48 ) + " ";
      menu_list.push(
        '\n<form id="domain" url="/">',
        '\n<select name="kudo" onchange=',
        '"if( this.value !== 0 ){ ',
          //'this.form[0].value = this.value;',
          '$(this.form).submit();',
        '}">'
      );
      
      valid_machines.forEach( function( label, index ){
        
        var i18n_label = "@" + label;
        
        // 'Search #domain' is special, it will be detected by server
        if( label === 'Search #domain' ){
          i18n_label = l( label );
          label = "search";
        
        // Add the alias, if there is one
        }else{
          var persona = Persona.find( "@" + label );
          if( persona ){
            i18n_label = ui.persona_short_label( persona );
            // First choice is current machine, display it differently
            if( !index ){
              var comment_text = persona.get_comment_text();
              if( comment_text ){
                // Get rid of potential alias
                if( comment_text[0] === "@" ){
                  comment_text = comment_text.replace( /@[A-Za-z0-9_]* */, "" );
                }
                after_menu += '<div class="">'
                + ui.wikify_comment( comment_text )
                + "</div>";
              }
            }
          }
        }
        
        menu_list.push( 
          '\n<option value="',
          label,
          '">',
          i18n_label,
          '</options>'
        );
        
      }); // for each machine
      
      menu_list.push( '\n</select>', after_menu );
      
      // Provide a submit button unless client was explicit about noscript
      if( session.can_script !== true ){
        menu_list.push( ' <input type="submit" value="', l( "Visit" ), '">' );
      }
      
      menu_list.push( '</form><br>\n' );
      menu += menu_list.join();
    }
    
    // Get back to the previous current machine
    current_machine.activate();
    
  }
  
  // This is to reload the index page that manifest.appcache stores
  function reload_if_cached( is_manifest_index ){
    if( !is_manifest_index )return;
    console.info( "Cached, for manifest.appcache, reload index page" );
    var new_location = "/?page=kudocracy";
    this.kudo_new_location = new_location;
    window.location.replace( new_location );
  }
  
  // The index page has to be stored by the offline manifest.appcache stuff
  var is_manifest_index = false;
  if( ui.get_config().appcache_support && session.request.url === "/" ){
    is_manifest_index = true;
  }
  
  function link_to( page, title, slim ){
    var r = '<a href="';
    if( domain ){
      r += page + "?kudo=" + domain;
      if( slim ){
        r += "&slim=true";
      }
    }else{
      r += page;
      if( slim ){
        r += "?slim=true";
      }
    }
    r += '">' + icon( title || page ) + "</a>";
    return r;
  }
  
  var twitter_name = domain || ui.get_config().domain;
  
  var twitter_timeline = new ui.Builder(
    '\n<div id="twitter_buttons" class="twitter_timeline">',
    '<a class="twitter-timeline" ',
      // 'data-dnt="true"', 
      'href="https://twitter.com/', twitter_name, '" ',
      'data-screen-name="', twitter_name, '" ',
      'data-widget-id="299354291817287681" ',
      'data-show-replies="true" ',
      'data-tweet-limit="7" ',
      'lang="', session.lang, '" ',
      '>',
      'Tweets by @', twitter_name,
    '</a></div>'
  ).join();
  
  // When '/' style, display with a special style
  if( !is_main ){
    
    this.set_head(
      '\n<link rel="stylesheet" href="' + ui.get_config().style + '">'
      + '\n<link rel="stylesheet" href="' + ui.get_config().index_style + '">'
      + '\n<title>'
        + ( is_manifest_index ? "@Kudocracy" : "Kudocracy" ) // manifest.appcache
      + '</title>'
    );
    
    var wiki = "";
    // Suvranu uses framasoft's wiki
    if( domain === "suvranu" ){
      wiki = "https://suvranu.frama.wiki/HomePage";
    // Others uses simpliwiki
    }else{
      wiki = ui.get_config().wiki
      + ( domain ? domain + "/" : "" ) 
      + "HomePage"
      + "?kudocracy=" + session.wiki_context();
    }
    
    this.set_body(

      '\n<script>',reload_if_cached,";reload_if_cached(", is_manifest_index, ');</script>',
      
      '\n<div id="background" class="background">',
      '\n<div id="header">',
        '\n<div id="header_content">',
          // '<img src="http://virteal.com/alpha.gif" type="img/gif" style="position:absolute; top:0; right:0;">',
          '\n<div class="sw_logo">', // was style="float:left;" class="sw_logo sw_boxed"
            '\n<div>', // was  style="float:left;"
            '<img src="http://virteal.com/yanugred64.png" width="64" height="64" type="image/png" alt="YanUg"/>',
            '</div>',
            '\n<div id="slogan" style="min-height:64px; height:64px;">',
            '<strong>' + ui.link_to_twitter_filter( "#kudocracy", "#kudo<em>c</em>racy", true ) + '</strong>',
            '\n<br>', l( "virtual democracy" ),
            '\n</div>',
          '</div>',
      
      '<div id="kudo_header_menu">',
      
      menu,
      
      // search/login/mobile-app/wiki/info
      
      ' ', ui.titled( link_to( "propositions" ), l( "Search" ) ),
      
      ' - ', '<a title="Wiki" class="wiki" href=', 
        wiki, '>', icon( "wiki" ), '</a>',
      ' - ',
      
      authentic_twitter_id
      ? ui.link_to_page( "visitor", "", ui.avatar( authentic_twitter_id, 32 ) )
        + ui.titled( link_to( "signout" ), l( "sign out" ) )
      : ui.titled( link_to( "login" ), l( "login" ) ),
      
      l8.client ? "" : ' - '
        + ui.titled( link_to( "main", "light version", true ), l( "mobile" ) ),
      ' - ', ui.titled( link_to( "help" ), l( "help" ) ),
      
      '</div>',
      
      icon( "show" ), // hidden show button
      
      '</div></div>',
      // '<br>',
      
      '<div id="index_view">',
      '<div id="container" class="index-container">'
      
    );
    
  }
  
  if( is_main ){
    
    this.set( ui.page_style( "main" ), ui.page_header_left() );
    
    // Menu to go to another domain
    if( menu ){
      this.push( menu );
    }
  
  }
  
  // Add link to Suvranu's twittrust page
  if( domain === "suvranu" ){
    this.br().open_div( "news" )
      .h2(
        "Nouveau : le palmar&egrave;s des comptes Twitter en Corse : "
      ).push(
          " " + ui.link_to_page( "twittrust",  "all 10 1",      "10" )
        + " " + ui.link_to_page( "twittrust",  "all 100 1",    "100" )
        + " " + ui.link_to_page( "twittrust",  "all 1000 1",  "1000" ),
        "<br>",
        "&eacute;tabli sur la base des ",
        Kudo.TwitterUser.get_community_size(),
        " membres de la communaut&eacute; ", 
        ui.link_to_twitter_user( "@suvranu" ),
      "<br>"
      )
    .close_div();
  }
  
  var title = icon( "Kudocracy" );
  var tag_set = this.push_title_and_search_form( title /* , "force" hide */ );
  
  
  // Recent events, it floats on the right
  this.push(
    '<div class="twitter_style">',
      ui.recent_events_div( page_name ),
    '</div>'
  );
  
  var propositions = Topic.all;
  var list = [];
  var count = 0;

  var visitor = session.visitor;
  var filter = session.filter;
  
  // Skip tags in "main" page, unless some tags are inside filter
  var skip_tags = !searching_domains 
  && filter.indexOf( " #tag "       ) === -1
  && filter.indexOf( " #persona"    ) === -1
  && filter.indexOf( " #impersonal" ) === -1;
  
  var without_orphans  = filter.indexOf( " #orphan "  ) === -1;
  var without_personas = filter.indexOf( " #persona " ) === -1;
  
  if( searching_domains ){
    skip_tags = without_orphans = without_personas = false;
  }
  
  var sort_criterias = session.sort_criterias;
  var sort_criteria = sort_criterias[0];
  if( sort_criteria ){
    sort_criteria = " " + sort_criteria.substring( 1 ) + " "; // Remove +/-
  }
  
  var with_author = sort_criteria === " author ";
  var with_age = with_author;
  if( ! with_age && sort_criteria ){
    with_age = " age_modified age heat ".indexOf( sort_criteria ) !== -1;
  }
  // Scan all propositions, could be a lot! Collect filtered ones
  Ephemeral.every( propositions, function( proposition ){
    
    // Apply filter
    if( proposition.is_tag() ){
      if( skip_tags )return true;
    }
    if( !proposition.filtered(
      filter,
      session.filter_query,
      visitor
    ) )return true;
    
    // Avoid excessive output, exit loop
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

  // Filter out propositions without a meaningful measure
  var invalid_count = count;
  var valid_list = [];
  var measure = sort_criterias[ 0 ].substring( 1 );
  Ephemeral.each( list, function( proposition ){
    if( proposition.last_measure( measure )
    || proposition === session.proposition
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

  var that = this; // The PageBuilder object
  var div = ui.item_divs( "proposition" );
  
  // Propositions list, it floats on the left
  this.push(
    '\n\n<div class="twitter_style">',
    '<div id="propositions_list">',
    '<div class="hide_button"></div>',
    '<div id="propositions_list_header">',
    ui.link_to_page(
      "propositions", 
      "all",
      l( "Propositions" ) + "&nbsp;" + icon( "propositions" )
    ),
    '</div>'
  );

  var msg1 = "";
  if( !count ){
    if( invalid_count ){
      msg1 += l( "empty" ) + " " + ui.sort_label( true, true ) + ". ";
      msg1 += invalid_count + " " + icon( "propositions" ) + " ";
      msg1 += ui.sort_menu( "", true /* dont_hide */ );
    }
  }else{
    
    //if( count > 1 ){
      msg1 += ui.sort_menu();
    //}
    
    if( count >= 200 ){
      msg1 += l( "among" ) + " ";
    }
    
    msg1 += count + " " + icon( "propositions" ) + " ";
  
    if( count > 1 ){
      var sort_msg = ui.sort_label( true );
      if( sort_msg ){
        msg1 += sort_msg;
      }
    }
    
    msg1 
    += " - " + icon( "zoom-in" ) 
    +  " "   + ui.link_to_page( "proposition", "", l( "details" ) )
    +  " "   + icon( "delegations" )
    +  " "   + ui.link_to_page( "delegates", "", l( "delegates" ) );
  }
  
  // new proposition
  if( visitor ){
    msg1 += " " + ui.link_to_page(
      "propose",
      "",
      '<span class="label label-success">'
      + l( "new&nbsp;proposition" )
      + '</span>'
    ); // + ".";
  }
  
  this.push( '<div class="section">', msg1, '</div>' );

  // For each proposition, display it
  Ephemeral.each( list, function( proposition, index ){
    
    // Display the 200 first proposition only
    if( index > 200 ){
      tag_set.add_proposition( proposition );
      return;
    }

    that.push( '<div class="proposition">' );
    
    that.push_vote_menu(
      proposition,
      { float: "right", compact: true, with_twitter: true }
    );
    
    // Optional comment
    var comment = proposition.get_comment_text();
    if( comment ){
      that.push( 
        '<h3>', ui.wikify_comment( comment ), '</h3><br>'
      );
    }
    
    // proposition's name
    that.push(
      icon( "zoom-in" ), " ",
      proposition.is_tag() ? l( "Tag" ) + " " : "",
      ui.link_to_page( "proposition", proposition.label ),
      " ", 
      !nuit_debout && ui.link_to_wiki( proposition.label ),
      proposition.is_persona()
      && ( '<dfn>(' 
        + ui.link_to_persona_page( proposition.get_persona() )
        + ")</dfn> "
        + ( nuit_debout ? ", une&nbsp;personne" : "" )
      )
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
        var toggle = ui.link_to_command( "filter_toggle " + tag, alias || label );
        if( alias ){
          // Show true name in title of link if there is an alias displayed
          toggle = ui.titled( toggle, persona.label );
        }
        that.push(
          ui.link_to_persona_page( persona, "@" ), // "@" => no label, only image
          toggle,
          " "
        );
      }else{
        that.push(
          ui.link_to_command( "filter_toggle " + tag, icon( label ) ),
          " "
        );
      }
    } );
    that.push( '</dfn></small></span>' );
    that.push( '<div class="clear"></div></div>' );
    
  });
  
  this.push( "</div></div>\n\n" );
  
  // The twitter timeline, in the middle
  var optional_twitter_timeline 
  = session.fragment( "twitter_timeline", twitter_timeline );
  if( optional_twitter_timeline || !session.page_is_headless ){
    this.push(
      '<div id="main_twitter_timeline" data-magic="upsert">',
      twitter_timeline,
      '<div class="hide_button">', l( "hide" ), ' </div>',
      '</div>'
    );
  }
  
  // Inject list of all seen tags, to alter filter when clicked
  this.set_change_filter_links( tag_set );
  
  if( is_main ){
    this.push( ui.page_footer() );

  // if index page
  }else{
    
    var rename = '\ntry{ var kudo_index_url = "';
    
    var full_query = session.full_query();
    if( !full_query || full_query === "-heat" ){
      // Index page renames itself to point on proper domain
      rename += "/" + domain;
    }else{
      rename += 
      session.url
      .replace( /page=[^.&]*/, "page=main/" + ui.encode_ref( full_query ) );
    } 
      
    rename += '";'
    + '\nhistory.replaceState( kudo_index_url, "Kudocracy", kudo_index_url );'
    + '\n}catch(_){}\n';
    
    this.push(
      
      '</div><br><br></div>',
      
      '<div style="clear:both;">',
      '<br>(C) 2015-2016 <a href="http://github.com/virteal">Virteal</a></div>',
      
      // Scripts
      '\n<script>window.applicationCache.addEventListener( "updateready", ',
        'function(){ ',
          'try{  window.applicationCache.swapCache(); ',
          'console.info( "swap cache has been called" );',
          '}catch(_){};',
        '}, false );',
        l8.client 
        && '\nif( !navigator.onLine ){ window.location="/offline"; }',
      '\n</script>',
      '\n<script src="https://ajax.googleapis.com/ajax/libs/jquery/2.2.2/jquery.min.js"></script>',
      "\n<script>",
        rename,
        ui.kudo_signal_capabilities,
        ui.kudo_hide,
        "\n$(function(){",
          "window.kudo_ctx = { should_clear_local_storage:",
          session.should_clear_local_storage ? "true" : "false",
          "};",
        "\nkudo_hide();",
        "\nkudo_signal_capabilities();",
      "\n});</script>",
      // Twitter buttons
      !session.is_offline  
      && '\n<script src="http://platform.twitter.com/widgets.js"></script>'
      //'<div><div><div>' + ui.page_footer()
    );
    
    if( searching_domains ){
      session.set_filter( "all" );
    }
  
  }
  
} // page_index()


exports.start = function( kudo_scope ){
  
  // Import stuff from main.js, shared with ui1_server defined in ui1core.js
  process_kudo_imports( kudo_scope );
  
  ui.register_page( "index",     page_index );
  ui.register_page( "kudocracy", page_index );
  ui.register_page( "main",      page_index );

};
