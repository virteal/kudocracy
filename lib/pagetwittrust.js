// pagetwitter.js
//  Info about trust among twitter community members
//
// dec 30 2017 by jhr


/*
 *  Some global imports
 */

var Ui1Server; 
var Kudo;
var ui;
var l;
var l8;
var de;
var nde = false;
var trace;
var bug;
var mand;
var assert;
var _;

function process_kudo_imports( kudo_scope ){
// This function fill the global Kudo map and init global variables with
// stuff imported from elsewhere.
  Kudo    = kudo_scope;
  ui      = Kudo.ui;
  l       = ui.l;
  l8      = Kudo.l8;
  _       = Kudo._;
  // My de&&bug() and de&&mand() darlings
  de      = true;
  trace   = Kudo.trace;
  bug     = trace;
  mand    = Kudo.assert;
  assert  = Kudo.assert;
  // More imports
  // ui1core stuff
  Session    = Kudo.Session;
  // Exports
}


function format_status( status ){

  var text = status.text;
  var buf = "";
  buf += '<blockquote class="twitter-tweet twitter_render" data-lang="fr">';
  buf += '<p lang="fr" dir="ltr">';
  buf += text;
  buf += ' <a href="'
  buf += 'https://twitter.com/'
  buf += status.screen_name;
  buf += '/status/'
  buf += status.id;
  buf += '">Tweet</a>';
  buf += '</blockquote><br>';
  return buf;
  
}


function page_twittrust( page_name, p1, p2, p3 ){
  
  var session = this.session;
  
  // Header
  this.set( 
    ui.page_style( "twittrust" ),
    ui.page_header(
      _,
      ui.link_to_twitter_filter( "#corse", "", true /* no_icon */ ),
      _
    )
  );
  
  session.needs_twitter = true;
  
  var target;
  var actor;
  var name = "all";
  if( p1 && p1 !== "all" ){
    target = Kudo.TwitterUser.find( p1 );
    if( target ){
      name = target.screen_name;
      actor = Kudo.TrustActor.find( target.id );
    }else{
      name = "all";
    }
  }
  
  var top_n;
  top_n = parseInt( p2, 10 );
  if( !top_n ){
    top_n = 100;
  }
  
  var criteria = p3;
  if( !criteria ){
    criteria = "2";
  }
  var depth;
  depth = parseInt( p3, 10 );
  if( !depth ){
    depth = criteria;
  }

  var msg = new ui.Builder();
  
  msg.push(
    "<br>", ui.icon( "home" ), " ",
    ui.link_to_page( "index" )
  );
  if( session.domain ){
    msg.push( " ", session.domain );
  }
  msg.push( " ", ui.link_to_wiki_icon( "HomePage" ) );

  this.open_div( "twittrust_view" );

  if( target ){
    
    var twitter_data = target.twitter_user_data;
    var label = ( twitter_data && twitter_data.name ) || name;
    this.open_div( "top_twitter" );
    
    var profile 
    = ' <a href="http://twitter.com/intent/user?screen_name='
    + target.screen_name
    + '" title="twitter '
    + label 
    + '">'
    + ui.avatar( target.screen_name, 126 )
    + '</a> ';
    
    this.push( profile )
    .h2( label )
    .push(
      " ", 
      ui.link_to_twitter_user( target.screen_name ),
      ' - <a href="https://agilience.com/fr/',
      target.screen_name,
      '">recommendations de lecture</a>'
    ).br();
    var rank = ( actor && actor.get_rank() ) || 0;
    if( rank ){
      this.push( "top " + rank + ". " );
    }
    if( false ){
      if( target.friends_count ){
        this.push( target.friends_count, " amis suivis. " );
      }
      if( target.followers_count ){
        this.push( target.followers_count, " abonn&eacute;s. " );
      }
    }
    if( twitter_data && twitter_data.followers_count ){
      this.push( twitter_data.followers_count, " abonn&eacute;s Twitter. " );
    }
    this.push( 
      Math.round( target.action_rate ),
      " interventions par semaine en moyenne. "
    ).br().br();
    
    var statuses = target.get_last_statuses();
    for( ii = 0 ; ii < statuses.length ; ii++ ){
      var status = statuses[ ii ];
      this.push( format_status( status ) );
    }
    this.br().br().close_div();
  }
  
  var community_size
  = Kudo.TwitterUser.get_community_size();
  var community_friendships_count 
  = Kudo.TwitterUser.get_community_friendships_count();
  
  // <h2> Comptes Twitter
  var link = function( p, l ){
    return  " " + ui.link_to_page( page_name, name +  " " + p, l );
  }
  this.open_div( "top_twitter", "", "hide" ).h2(
    "Le palmar&egrave;s des comptes Twitter en Corse"
  ).push(
    " - "
    + link(   "10 " +  depth,         "10" )
    + link(  "100 " +  depth,         "100" )
    // + link( "1000 " +  depth,         "1000" )
    // + link( top_n   +   " 1",         "x1" )
    // + link( top_n   +   " 2",         "x2" )
    // + link( top_n   +   " 3",         "x3" )
    + link( top_n   +   " pagerank",  "influents" )
    + link( top_n   +   " followers", "abonn&eacute;s" )
    + link( top_n   +   " rate",      "actifs" )
    // + link( top_n   +   " locality",  "corse" )
    // + " - " + ui.link_to_page( "delegates", "all all", l( "votes" ) )
    + " - "
    + ui.link_to_page(
      "toptweets", "all " + top_n + " pagerank", "top tweets"
    )    
    + "<br>",
    "&eacute;tabli sur la base des ",
    community_friendships_count,
    " relations entre les ",
    community_size,
    " membres de la communaut&eacute; ", 
    ui.link_to_twitter_user( "@suvranu" ),
    ". Une initiative de l'<a href=\"",
    "https://www.facebook.com/Fondation-Mariani-180454325876880/",
    "\">Institut Mariani</a>.",
    "<br>"
  );
  
  var trust = Kudo.TrustActor.get_ranked( top_n, depth, target );
  
  this.br().push( "Les ", top_n, " " );
  if( depth === "followers" ){
    this.push( "ayant le plus d'abonn&eacute;s" );
  }else if( depth === "rate" ){
    this.push( "plus actifs" );
  }else if( depth === "locality" ){
    this.push( "actifs qui suivent en priorité les membres de la communaut&eacute;" );
  }else{
    this.push( "plus influents en Corse" );
  }
  this.push( " sont : " );
  var actors = trust.actors;
  if( !actors ){
    trace( "BUG? bad actor list from .get_ranked()" );
    actors = [];
  }
  community_size = Kudo.TwitterUser.get_community_size();
  var actor;
  var twitter_user;
  var data;
  for( var ii = 0 ; ii < actors.length ; ii++ ){
    
    actor = actors[ ii ];
    twitter_user = actor.twitter_user;
    
    this.push( 
      "<br>" + ( ii + 1 ),
      " - "
    );
    
    data = actor.twitter_user.twitter_user_data;
    if( data ){
      this.push( 
        " ", 
        ui.link_to_page( 
          page_name, 
          twitter_user.screen_name + " " + top_n + " " +  depth,
          twitter_user.twitter_user_data.name
        )
      );
    }else{
      this.push( "" + actor.id );
    }
    
    if( depth !== "pagerank" ){
      var rank = actor.get_rank();
      if( rank ){
        this.push( " top " + rank );
        if( rank < ii ){
          this.push( " *" );
        }
      }
    }
    
    if( false ){
      var percent 
      = Math.round( twitter_user.friends_count * 10 * 100 / community_size  ) / 10;
      if( percent ){
        this.push( "" + percent + "% en ami, " );
      }else{
        // this.push( "sans amis" );
      }
      percent 
      = Math.round( actor.followers_count * 10 * 100 / community_size  ) / 10;
      if( actor.followers_count ){
        this.push( "suivi &agrave; ", percent, "%" );
      }
    }
    
    if( top_n < 100 ){
      this.push( format_status( actor.twitter_user.get_last_status() ) );
    }
  }
  
  this.close_div();
  
  this.close_div();
  
  this.push(  "<br>", ui.page_footer() );

}



function page_toptweets( page_name, p1, p2, p3 ){
  
  var session = this.session;
  
  // Header
  this.set( 
    ui.page_style( "twittrust" ),
    ui.page_header(
      _,
      ui.link_to_twitter_filter( "#corse", "", true /* no_icon */ ),
      _
    )
  );
  
  session.needs_twitter = true;
  
  var target;
  var name = "all";
  if( p1 && p1 !== "all" ){
    target = Kudo.TwitterUser.find( p1 );
    if( target ){
      name = target.screen_name;
    }else{
      name = "all";
    }
  }
  
  var top_n;
  top_n = parseInt( p2, 10 );
  if( !top_n ){
    top_n = 100;
  }
  
  var criteria = p3;
  if( !criteria ){
    criteria = "pagerank";
  }
  var depth;
  depth = parseInt( p3, 10 );
  if( !depth ){
    depth = criteria;
  }

  var msg = new ui.Builder();
  
  msg.push(
    "<br>", ui.icon( "home" ), " ",
    ui.link_to_page( "index" )
  );
  if( session.domain ){
    msg.push( " ", session.domain );
  }
  msg.push( " ", ui.link_to_wiki_icon( "HomePage" ) );

  this.open_div( "twittrust_view" );

  // <h2> Comptes Twitter
  var community_size
  = Kudo.TwitterUser.get_community_size();
  var community_friendships_count 
  = Kudo.TwitterUser.get_community_friendships_count();
  var link = function( p, l ){
    return  " " + ui.link_to_page( page_name, name +  " " + p, l );
  };
  this.open_div( "top_twitter", "", "hide" ).h2(
    "Le palmar&egrave;s des tweets en Corse"
  ).push(
    " - "
    + link(   "10 " +  depth,       "10"  )
    + link(  "100 " +  depth,       "100" )
    + link( top_n   + " t24h",      "24h" )
    + link( top_n   +  " t7j",      "7j" )
    + link( top_n   + " t28j",      "28j" )
    //+ link( top_n   +   " followers", "abonn&eacute;s" )
    //+ link( top_n   +   " rate",      "actifs" )
    + " - "
    + ui.link_to_page( 
      "twittrust", "all " + top_n + " pagerank", "top comptes"
    )
    + "<br>",
    "&eacute;tabli sur la base des ",
    community_friendships_count,
    " relations entre les ",
    community_size,
    " membres de la communaut&eacute; ", 
    ui.link_to_twitter_user( "@suvranu" ),
    ". Une initiative de l'<a href=\"",
    "https://www.facebook.com/Fondation-Mariani-180454325876880/",
    "\">Institut Mariani</a>.",
    "<br>"
  );
  
  var trust = Kudo.TrustTweet.get_ranked( top_n, depth, target );
  
  this.br().push( "Les ", top_n, " " );
  if( depth === "followers" ){
    this.push( "ayant le plus d'abonn&eacute;s" );
  }else if( depth === "rate" ){
    this.push( "plus actifs" );
  }else if( depth === "locality" ){
    this.push( "actifs qui suivent en priorité les membres de la communaut&eacute;" );
  }else{
    this.push( "plus influents en Corse" );
  }
  this.push( " sont : " );
  var tweets = trust;
  if( !tweets ){
    trace( "BUG? bad tweets list from .get_ranked()" );
    tweets = [];
  }
  community_size = Kudo.TwitterUser.get_community_size();
  var tweet;
  var twitter_user;
  var data;
  for( var ii = 0 ; ii < tweets.length ; ii++ ){
    
    tweet = tweets[ ii ];
    twitter_user = tweet.actor.twitter_user;
    
    this.push( 
      "<br>" + ( ii + 1 ),
      " - "
    );
    data = twitter_user.twitter_user_data;
    if( data ){
      this.push( 
        " ", 
        ui.link_to_page( 
          page_name, 
          twitter_user.screen_name + " " + top_n + " " +  depth,
          twitter_user.twitter_user_data.name
        )
      );
    }else{
      this.push( "" + twitter_user.id );
    }
  
    var rank = tweet.actor.get_rank();
    if( rank ){
      this.push( " top " + rank );
    }

    this.push( format_status( tweet.status ) );
  }
  
  this.close_div();
  
  this.close_div();
  
  this.push(  "<br>", ui.page_footer() );

}


exports.start = function( kudo_scope ){
  
  // Import stuff from main.js, shared with ui1_server defined in ui1core.js
  process_kudo_imports( kudo_scope );
  
  Kudo.ui.register_page( "twittrust", page_twittrust );
  Kudo.ui.register_page( "toptweets", page_toptweets );
  
};
