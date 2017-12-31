// pageproposition.js
//  page about about a proposition
//
// dec 30 2017 by jhr, extracted from ui1core.js


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
var value;
var pretty;
var _;
var Ephemeral;
var Topic;
var Persona;
var Vote;
var Delegation;
var Comment;
var Session;
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
  // ui1core stuff
  Session    = Kudo.Session;
  ui         = Kudo.ui;
  l = ui.l;
  icon = ui.icon;
}


/* ---------------------------------------------------------------------------
 *  page proposition
 */
 
function page_proposition( /* page_name, proposition_name, display_what */ ){
// Focus on one proposition

  var nuit_debout = true;
  
  var page_name        = arguments[ 0 ];
  var proposition_name = arguments[ 1 ];
  var display_what     = arguments[ 2 ];

  var proposition = Topic.find( proposition_name );
  if( !proposition )return this.redirect( "propositions" );
  proposition.check();
  
  if( !display_what ){
    return this.redirect( "proposition " + proposition.label  + " comments" );
  }
  
  var only_direct_votes   = ( display_what === "direct"   );
  var only_indirect_votes = ( display_what === "indirect" );
  var only_comments       = ( display_what === "comments" );

  var buf = this;
  var session = this.session;
  var visitor = this.session.visitor;
  session.proposition = proposition;
  var result  = proposition.result;
  var persona = proposition.get_persona();

  var is_tag = proposition.is_tag();
  var tagged_propositions = proposition.propositions();
  var tag_label;
  var label;
  
  if( is_tag ){
    tag_label = proposition.label;
    label = tag_label.substring( 1 );
  }else{
    label = proposition.label;
    tag_label = "#" + label;
    var as_tag = Topic.find( tag_label );
    if( as_tag ){
      tagged_propositions = as_tag.propositions();
    }
  }
  
  // page proposition - style & header
  this.set(
    ui.page_style( proposition.label ),
    ui.page_header(

      ui.titled(
        ui.link_to_page( "delegates", proposition.label, icon( "delegates" ) ),
        l( "delegates" )
      ) + " " 
      + ui.titled(
        ui.link_to_page( "ballot2", proposition.label, icon( "ballot" ) ),
        l( "ballot" )
      ),

      ui.link_to_twitter_filter( tag_label ),

      _,
      "proposition" // Name of current page
    )
  );
  
  this.open_div( "proposition_view" );
  
  // page proposition - Graph preparation
  var graph_pie = {};
  graph_pie.agree    = result.agree();
  graph_pie.disagree = result.disagree();
  graph_pie.protest  = result.protest();
  graph_pie.blank    = result.blank();
  var graph_serie = [ [ proposition.timestamp, 0 ] ];
  var balance = 0;

  // page proposition - Proposition's name & twitter + wiki links
  nuit_debout && buf.push( "R&eacute;f&eacute;rence de la proposition : " );
  buf.push(
    '<h2>', (is_tag ? l( "Tag" ) + " " : "" ),
    l( proposition.label ),
    '</h2>'
  );
  
  if( persona ){
    nuit_debout && buf.push( "<br>Il s'agit du nom d'une personne ou d'un organisation : " );
    buf.push( ' ' + ui.link_to_persona_page( persona ) );
    nuit_debout && buf.push( "<br>Elle dispose d'une page sur twitter : " );
    buf.push( ' ', ui.link_to_twitter_tag( proposition.label, false /* title */ ) );
    nuit_debout && buf.push( " et d'une page dans le wiki : " );
    buf.push( ' ', ui.link_to_wiki_icon( persona.label ) );
  }
  
  // page proposition - Tweet to persona
  if( persona ){
    nuit_debout && buf.push( "<br>Vous pouvez mentionner et suivre le compte twitter : " );
    !nuit_debout && buf.push( "<br>" );
    var p_label = persona.label;  // Twitter tweet & follow buttons
    this.push(
      '<a href="http://twitter.com/intent/tweet?screen_name=',
      p_label.substring( 1),
      '" class="twitter-mention-button">',
      'Tweet to ', p_label, '</a> ',
      '<a href="http://twitter.com/', p_label,
      '" class="twitter-follow-button" data-show-count="true">',
      'Follow ', p_label, '</a>'
    );
  }
  
  // page proposition - Comment?
  var comment = proposition.get_comment_text();
  var author  = proposition.get_comment_author();
  // Don't display author twice
  if( author === persona ){
    author = null;
  }
  if( comment ){
    nuit_debout && buf.push( ". L'intitul&eacute; de cette proposition est :<br>" );
    buf.push(
      '<br><h3>',
      ui.wikify_comment( comment ),
      '</h3>'
    );
  }
  if( author ){
    nuit_debout && buf.push( "<br><br>L'auteur de cet intitul&eacute; est : ");
    buf.push(
      ' <dfn>',
      ui.link_to_persona_page( author ),
      '</dfn>'
    );
  }
  if( !persona ){
    nuit_debout && buf.push( ". La proposition dispose d'une page dans le wiki : " );
    buf.push( ' ', ui.link_to_wiki_icon( proposition.label ) );
  }
  if( author || comment ){
    buf.br();
  }

  // page proposition - Display link to tagged propositions
  if( tagged_propositions.length ){
    nuit_debout && buf.push( "<br><br>Des propositions sont dot&eacute;es de ce tag : " );
    buf.push(
      tagged_propositions.length, " ",
      ui.link_to_page(
        "propositions",
        tag_label,
        icon( "zoom-in" ) + " " + l( "details" )
      ),
      "<br>"
    );
  }

  // page proposition - Share tweet button
  buf.push(
    '<div id="twitter_buttons">'
  );
  nuit_debout && buf.push( "<br>Vous pouvez partager un lien vers cette proposition : " );
  !nuit_debout && buf.push( "<br>" );
  buf.push(
    '<a href="http://twitter.com/share" class="twitter-share-button"',
    ' data-url="http://',
    session.host,
    "/proposition/",
    proposition.label.replace( "#", "%23" ),
    "?kudo=", session.domain_label(),
    '" data-text="#kudocracy ' + tag_label,
    '" data-count="horizontal',
    '">tweet</a>'
  );
  
  // page proposition - Badge
  nuit_debout && this.push( " Pour inclure cette proposition dans une page HTML : " );
  this.push( " ", ui.link_to_page( "badges", "", l( "badge" ) ) );
  
  this.push( "</div>" ); // div twitter_buttons
  
  // page proposition - Kudocracy domain?
  if( persona && persona.is_domain() ){
    nuit_debout && buf.push( "<br>Cette proposition porte sur un domaine du même nom : " );
    this.push(
      '<div id="domain"><h2>',
      icon( "proposition" ), " ",
      l( "Domain propositions" ), " ",
      '<a href="?kudo=', persona.short_label(),
      '&page=propositions',
      '">', persona.label, '</a></h2><br><br></div>'
    );
  }
  
  // page proposition - Vote menu
  nuit_debout && buf.push( "<br><br>Pour voter au sujet de cette proposition : " );
  buf.push_vote_menu( 
    proposition, 
    { 
      no_twitter_link: true,
      with_twitter: true,
      nofocus: true
    } 
  );
  nuit_debout && buf.push( "<br>" );

  // page proposition - Pie graph
  if( session.can_script && proposition.result.total() ){
    buf.push( 
      '<br><div><div class="hide_button"></div>',
      '<div id="orientation_chart_div" class="chart_pie"></div>',
      '</div>'
    );
  }
  
  // page proposition - Balance time serie graph
  if( session.can_script ){
    buf.push( 
      '<div><div class="hide_button"></div>',
      '<div id="balance_chart_div" class="chart_serie"></div>',
      '</div>'
    );
  }
  
  // page proposition - Picture of other personas who voted
  var recommendations = ui.proposition_recommendations({
    proposition: proposition,
    persona: visitor,
    without_indirect: only_direct_votes,
    without_direct:   only_indirect_votes,
    count: 250 // Dunbar?
  });
  if( recommendations.length ){
    buf.push(
      '<br><div id="others" class="even">',
      '<div class="hide_button"></div>'
    );
    buf.push( "Quelques votes : " );
    buf.push( '<table>' );
    var by_orientation = {
      agree: [],
      disagree: [],
      protest: [],
      blank: []
    }
    Ephemeral.each( recommendations, function( vote ){
      var orientation = vote.orientation();
      if( !by_orientation[ orientation ] ){
        trace( "BUG? invalid orientation:", orientation );
        debugger;
        return;
      }
      by_orientation[ orientation ].push( vote );
    });
    [ "agree", "disagree", "protest", "blank" ].forEach(
      function( orientation ){
        var list = by_orientation[ orientation ];
        if( !list.length )return;
        var sz = 64;
        if( list.length > 60 ){
          sz = 32;
        }else if( list.length > 30 ){
          sz = 48;
        }
        buf.push( 
          "<tr><td><h2> ", 
          ui.emojied( orientation ), 
          " </h2></td><td>"
        );
        list.forEach( function( vote ){
          buf.push( ui.titled(
            ui.link_to_persona_page( 
              vote.persona,
              ui.avatar( vote.persona.label, sz )
            ),
            ui.persona_long_label( vote.persona )
          ));
        });
        buf.push( "</td></tr>" );
      }
    );
    buf.push( "</table></div>" );
  }

  // page proposition - Summary
  buf.push( 
    '<div id="proposition_details">',
    '<br>', ui.proposition_summary( proposition, "div" ),
    '<br>'
  );

  // page proposition - Last vote (last direct one preferably)
  var votes_log = proposition.votes_log();
  if( votes_log.length ){
    var last_vote_value = votes_log[ votes_log.length -1 ];
    var last_direct_vote = null;
    var ii = votes_log.length;
    var candidate_vote;
    while( ii-- > 0 ){
      candidate_vote = votes_log[ ii ];
      if( !candidate_vote.agent_label && candidate_vote.orientation !== Vote.neutral ){
        last_direct_vote = candidate_vote;
        break;
      }
    }
    if( last_direct_vote ){
      last_vote_value = last_direct_vote;
    }
    buf.push( 
      '<div id="last_vote">',
      l( "last vote" ), " "
    );
    nuit_debout && buf.push( ": " );
    buf.push(
      ui.time_label( last_vote_value.snaptime )
    );
    var last_vote_entity = Vote.valid( last_vote_value.entity );
    var last_vote_persona = Persona.valid( last_vote_entity && last_vote_entity.persona );
    if( last_vote_entity
    &&  last_vote_persona
    ){
      nuit_debout && buf.push( ", orientation " );
      buf.push( ' <em>', ui.emojied( last_vote_entity.orientation() ), '</em>' );
      nuit_debout && buf.push( " par " );
      buf.push( ' ', ui.link_to_persona_page( last_vote_persona ) );
      if( last_vote_value.agent_label ){
        buf.push(
          ' <dfn>(',
          ui.link_to_delegation_page( last_vote_entity ),
          ')</dfn>'
        );
      }
    }
    buf.push( '</div>' ); // last_vote
  }

  // page proposition - Display author
  if( tmp = proposition.persona() ){
    !nuit_debout && buf.push( l( "by" ), " ", ui.link_to_persona_page( tmp ) );
  }
  
  // buf.push( "<br>", l( "since" ), " ", time_label( proposition.timestamp ) );
  //buf.push( "<br>age " + duration_label( proposition.age() ) );
  //buf.push( "<br>", l( "change" ), " ", time_label( proposition.time_touched ) );
  
  // page proposition - End in...
  if( proposition.half_life() ){
    nuit_debout && buf.push( "Sauf activit&eacute; nouvelle, cette proposition expirera " );
    buf.push( "<br>",
      l( "end in" ), " ", ui.duration_label( proposition.expire() - Kudo.now() )
    );
  }
  
  // page proposition - Display full comment if it was truncated
  if( comment.indexOf( "..." ) !== -1 ){
    nuit_debout && buf.push( "<br>L'intitul&eacute; complet, non tronqu&eacute; est : " );
    buf.push(
      '<div class="comment">',
      ui.wikify_comment( comment, true /* no trunctate */ ),
      '</div>'
    );
  }
  
  buf.push( '</div>' ); // proposition_details
  
  // page proposition - Tags, List of tags, with link to propositions
  var tmp = proposition.filter_string( persona, true /* only delegateable */ );
  // trace( "Tags: " + tmp );
  buf.push(
    '<br><br><div id="tags" class="even">',
    '<div class="hide_button"></div>',
    '<h2>',
    icon( "Tags" ), " ", l( "Tags" ),
    '</h2>'
  );
  if( proposition.is_tag() ){
    buf.push(
      ' - ',
      ui.link_to_page( "tags", "+age", l( "all(s)" ) )
    );
  }
  
  // Will add detagging form only for the author and domain owners
  var with_tag_form = session.can_tag( proposition );
  
  // page proposition - Add tagging form
  if( with_tag_form ){ // ToDo: allow tagging by some other "qualified" people

    // Display compact list of current tags 
    nuit_debout && buf.push( "<br>Cette proposition est dot&eacute;e de tags : " )
    buf.push( ui.filter_label_div( tmp, "propositions" ) );
   
    // Propose a tag that is logical if tags are hierachical somehow
    var tag_value = "";
    
    // Propose the most common not yet used tag
    var candidate_tags = [];
    var existing_tags = proposition.tags();
    Ephemeral.each( session.tag_entities, function( tag ){
      if( existing_tags.indexOf( tag ) !== -1 )return;
      // Avoid tags that are a persona's name
      if( Persona.find( "@" + tag.short_label() ) )return;
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
        if( Persona.find( "@" + tag.short_label() ) )return;
        return tag.propositions().length;
      });
      // If none, just pick the most common already set tag
      if( !most_common_tag ){
        most_common_tag = Ephemeral.max( proposition.tags, function( tag ){
          // Avoid tags that are a persona's name
          if( Persona.find( "@" + tag.short_label() ) )return;
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
            if( Persona.find( "@" + tag.short_label() ) )return;
            return tag.propositions().length;
          });
          if( max_tag ){
            if( most_common_proposition_tag === undefined ){
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
      '<input type="search" results="10" ',
      ' placeholder="', l( "additional tag" ), '"',
      ' autosave="tags"',
      ' spellcheck="false" autocapitalize="none" autocorrect="off"',
      tag_value ? ' value="' + tag_value + '"' : "",
      ' name="i4" />',
      ' <input type="submit" name="i2" value="Tag"/>',
      '</form>\n'
    );
  }
  if( tmp && session.can_untag( proposition ) ){
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
  buf.br();
  
  // page proposition - Add list of comments for all tags, including computed ones
  tmp = proposition.filter_string( persona, false /* all tags, not just delegateable tags */ );
  buf.push( 
    '\n<div id="filter_label">',
    with_tag_form && '<div class="hide_button"></div>',
    '<table>'
  );
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
      '<tr><td>',
      ui.link_to_page( "propositions", tag, l( tag ) ),
      count,
      '</td><td>'
    );
    var persona = tag_topic && tag_topic.get_persona();
    if( persona ){
      buf.push( ui.link_to_persona_page( persona ) );
      nuit_debout && buf.push( ", une&nbsp;personne" );
      buf.push( " " );
    }
    var comment = Topic.reserved_comment( tag );
    if( comment ){
      if( comment[0] === "@" ){
        comment = ui.link_to_page( "persona", comment +" all", comment );
        nuit_debout && ( comment += ", une&nbsp;personne" );
      }else{
        comment = l( comment );
      }
      buf.push( comment );
    }else if( comment 
      = ( tag_topic && Comment.valid( tag_topic.comment() ) )
    ){
      buf.push( ui.wikify_comment( comment.text ));
    }
    buf.push( '</td></tr>' );
  });
  buf.push( '\n</table></div></div>\n' );

  // page proposition - Top agents, actually inserted later
  var slot_index_delegates = buf.slot();
  
  // page proposition - Voters, actually inserted later
  var slot_index_voters = buf.slot();

  // page proposition - Log
  buf.push( 
    '<div id="log">',
    '<div class="hide_button"></div>',
    '<h2>', l( "Log" ),
    '</h2><br>'
  );
  //buf.push( "<ol>" );
  
  var votes = proposition.votes_log();
  var count = 0;
  var gap = false;
  var seen_comments = ui.set();
  var count_indirect_votes = 0;
  var count_direct_votes   = 0;
  var count_by_agent = ui.map();
  var tags_counts_by_agent = ui.map(); // map of maps
  var all_agents = [];
  var seen_personas = ui.set();
  var all_personas = [];
  var orientation_by_persona = ui.map();
  
  var div = ui.item_divs( "vote" );
  var div_index = -1;
  
  votes.forEach( function( vote_value, index ){
    
    if( !vote_value )return;
    
    // Compute balance agree/disagree
    var was = vote_value.previous_orientation;
    var now = vote_value.orientation;
    
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
    
    var idem = ( now === was );
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
      
      var is_direct = !vote_value.agent_label;
      if( only_direct_votes   && !is_direct )return;
      if( only_indirect_votes &&  is_direct )return;
      var comment = vote_value.comment_text;
      if( only_comments && ( !comment || seen_comments[ comment ] ) )return;
      
      count++;
      div_index++;
      buf.push( div[ div_index % 2 ] );
      
      var orientation = ui.emojied( now );
      if( vote_value.previous_orientation !== Vote.neutral
      && was !== now
      ){
        orientation = '<nobr><dfn>' 
        + ui.emojied( was ) + " " + icon( "arrow right" ) + "</dfn> "
        + orientation
        + '</nobr>';
      }
      
      var persona_text = "";
      persona_text = ui.link_to_persona_page( 
        vote_value.persona_label
      );
      
      var delegation_text = "";
      if( !is_direct ){
        delegation_text = ' <dfn>('
        + ui.link_to_delegation_page( valid_vote || vote_value.agent_label )
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
        persona_text
      );
      nuit_debout && buf.push( " a vot&eacute; " );
      buf.push(
        ' ', orientation,
        delegation_text,
        " <small>",
        ui.time_label( vote_value.snaptime ).replace( / /g, "&nbsp;" ),
        "</small>"
      );
      if( comment ){
        if( !seen_comments[ comment ] ){
          seen_comments[ comment ] = true;
          buf.push(
            '<br><div class="comment">'
          );
          buf.push( "Commentaire associé à ce vote : " );
          buf.push(
            '<h3>',
              ui.wikify_comment( comment, true /* no truncate */ ),
            '</h3></div>'
          );
        }
      }
      buf.push( "</div>" );
    }
    
  });
  
  if( !count ){
    buf.push( l( "empty" ), "." );
  }
  
  // Add fake data for continuity to "now"
  graph_serie.push( [ Kudo.now(), balance ] );
  
  if( de ){
    var agree    = proposition.result.agree();
    var disagree = proposition.result.disagree();
    if( agree - disagree !== balance ){
      trace(
        "Incorrect balance",
        "agree", agree, "minus disagree", disagree,
        "!== balance ", balance
      );
      debugger;
      proposition.check();
    }
  }
  
  // page proposition - Insert voters
  all_personas = all_personas.sort();
  var buf_voters = new ui.Builder();
  buf_voters.push(
    '<div id="voters"><br>',
    '<div class="hide_button"></div>',
    '<a id="voters"></a><h2>',
    l( "Voters" ),
    "</h2> - ",
    ui.link_to_page( "ballot2", proposition.label, icon( "ballot" ) )
  );

  buf_voters.br();
  
  // page proposition - voters, all comments direct indirect
  var plabel = proposition.label;
  
  buf_voters.push( icon( "votes" ), " " );
  if( only_comments || only_direct_votes || only_indirect_votes ){
    buf_voters.push( 
      " ", ui.link_to_page(
        "proposition", plabel + " all", l( "all(s)" ), "voters"
      )
    );
  }else{
    buf_voters.push( " <h3>", l( "all(s)" ), "</h3> " );
  }
  
  buf_voters.push( " - ", icon( "votes" ), "! " );
  if( !only_comments ){
    buf_voters.push( 
      " ", ui.link_to_page( 
        "proposition", plabel + " comments", l( "comments" ), "voters"
      )
    );
  }else{
    buf_voters.push( " <h3>", l( "comments" ), "</h3> " );
  }
  
  buf_voters.push( " - ", icon( "direct" ), " " );
  if( !only_direct_votes ){
    buf_voters.push( 
      " ", ui.link_to_page( 
        "proposition", plabel + " direct", l( "direct(s)" ), "voters"
      )
    );
  }else{
    buf_voters.push(" <h3>", l( "direct(s)" ), "</h3> " );
  }
  
  buf_voters.push( " - ", icon( "indirect" ), " " );
  if( !only_indirect_votes ){
    buf_voters.push( 
      " ", ui.link_to_page( 
        "proposition", plabel + " indirect", l( "indirect(s)" ), "voters"
      )
    );
  }else{
    buf_voters.push( " <h3>", l( "indirect(s)" ), "</h3> " );
  }
  
  buf.br();
  
  div_index = -1;
  
  all_personas.forEach( function( persona_id ){
    
    var persona = Persona.find( persona_id );
    if( !persona )return;
    var vote = persona.get_vote_on( proposition );
    if( !vote )return;
    var orientation = vote.orientation();
    if( orientation === Vote.neutral )return;
    var display = true;
    var delegation = vote.delegation();
    if( only_direct_votes && delegation !== Vote.direct ){
      display = false;
    }
    if( only_indirect_votes && delegation === Vote.direct ){
      display = false;
    }
    if( only_comments && !vote.comment() ){
      display = false;
    };
    div_index++;
    display && buf_voters.push(
      div[ div_index % 2 ],
      ui.link_to_persona_page( persona ),
      " "
    );
    if( delegation === Vote.direct ){
      count_direct_votes++;
    }else{
      var agent = Persona.valid( delegation.agent );
      if( agent ){
        display && buf_voters.push(
          ' <dfn>(',
          ui.link_to_delegation_page( vote ),
          ')</dfn> '
        );
        count_indirect_votes++;
        if( count_by_agent[ agent.id ] ){
          count_by_agent[ agent.id ]++;
        }else{
          count_by_agent[ agent.id ] = 1;
          all_agents.push( agent.id );
          tags_counts_by_agent[ agent.id ] = map();
        }
        var expertize = delegation._delegation_expertize;
        var filter = expertize._delegation_filter;
        var tags = filter.tags_string();
        var tmp_count = tags_counts_by_agent[ agent.id ][ tags ];
        if( !tmp_count ){
          tags_counts_by_agent[ agent.id ][ tags ] = 1;
        }else{
          tags_counts_by_agent[ agent.id ][ tags ] = tmp_count + 1;
        }
      }
    }
    nuit_debout && display && buf_voters.push( " vote " );
    display && buf_voters.push( ui.emojied( orientation ) );
    display && buf_voters.push( "</div>" );
  });

  buf_voters.push( "<br></div>" );
  buf.fill_slot( slot_index_voters, buf_voters.join() );
  
  // page proposition - Insert list of top 10 major agents
  var delegates_pie = [ [ 'direct', count_direct_votes ] ];
  if( count_indirect_votes ){

    var abuf = new ui.Builder();
    abuf.open_div( "proposition_delegates" ).hide_button()
    .br().h2( icon( "delegates" ), " ", l( "Delegates" ) )
    .push(
      " - ",
      ui.link_to_page( 
        "delegates",
        proposition.label,
        icon( "zoom-in" ) + " " + l( "details" )
      ),
      "<br><br>"
    );

    // page proposition - pie
    if( Session.current.can_script ){
      abuf.push( 
        '<div>',
        '<div class="hide_button"></div>',
        '<div id="delegates_chart_div" class="chart_pie"></div>',
        '</div>'
      );
    }
    
    // page proposition - Delegates sections
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
      if( count_shown === 10 )break;
      agent_id = all_agents[ ii ];
      var c = count_by_agent[ agent_id ];
      other_count -= c;
      var vote = Vote.find( agent_id + "." + proposition.id );
      if( !vote )continue;
      index++;
      count_shown++;
      abuf.push(
        div[ index % 2 ],
        ui.emojied( vote.orientation() ), " ",
        l( "via" ), " ",
        '<h3>', ui.link_to_persona_page( agent_id ), '</h3>'
      );
      ratio = Math.round( 1000 * ( 
        c / count_indirect_votes
      ) ) / 10;
      if( true || ratio !== 100 ){
        abuf.push(
          " ", c,
          "&nbsp;<dfn>(",
          ratio,
          "%)</dfn>."
        );
      }
      var tags_counts = tags_counts_by_agent[ agent_id ];
      var list = [];
      for( var tags_id in tags_counts ){
        list.push( tags_id );
      }
      list = list.sort( function( a, b ){
        return tags_counts[ b ] - tags_counts[ a ];
      });
      var count_shown_tags = 0;
      var idx_tag = 0;
      var tags_len = list.length;
      for( idx_tag = 0 ; idx_tag < tags_len ; idx_tag++ ){
        if( count_shown_tags >= 10 )break;
        var tags = list[ idx_tag ];
        if( idx_tag ){
          abuf.push( "," );
        }
        abuf.push(
          " ", 
          // ToDo: better i18, when multiple tags
          ui.link_to_page( "persona", agent_id + " all " + tags, l( tags ) )
        );
        if( tags_len > 1 ){
          ratio = Math.round( 1000 * ( 
            tags_counts[ tags ] / c
          ) ) / 10;
          abuf.push(
            " ", 
            tags_counts[ tags ],
            "&nbsp;<dfn>(",
            ratio,
            "%)</dfn>"
          );
        }
      }
      abuf.push(
        ".",
        "</div>"
      );
      delegates_pie.push( [ Persona.find( agent_id ).label, c ] );
    }
    
    if( other_count ){
      if( other_count < 0 )debugger;
      delegates_pie.push( [ l( "other" ), other_count ] );
    }
    buf.fill_slot( slot_index_delegates, abuf.join() );
    buf.push( '</div>' );
  }
  
  buf.push( "</div>" );
  
  this.close_div();
  
  this.push( ui.page_footer() );

  // Add data for graphics
  Session.current.can_script && buf.push(
    '<script type="text/javascript">'
    //+ '\nvar proposition = ' + proposition.json_value()
    + '\nvar graph_pie = '     + JSON.stringify( graph_pie )
    + '\nvar graph_serie = '   + JSON.stringify( graph_serie )
    + '\nvar delegates_pie = ' + JSON.stringify( delegates_pie )
    + '\nvar i18n = {};'
    + '\ni18n.agree    ="' + l( "agree" )    + '";'
    + '\ni18n.disagree ="' + l( "disagree" ) + '";'
    + '\ni18n.protest  ="' + l( "protest" )  + '";'
    + '\ni18n.blank    ="' + l( "blank" )    + '";'
    + '\n' + ui.proposition_graphics + '; proposition_graphics();'
    + '</script>'
  );
  
} // page_proposition()


exports.start = function( kudo_scope ){
  
  // Import stuff from main.js, shared with ui1_server defined in ui1core.js
  process_kudo_imports( kudo_scope );
  
  ui1_server.register_page( "proposition", page_proposition );
  
};
