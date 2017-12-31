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
var TwitterUser;


function process_kudo_imports( kudo_scope ){
// This function fill the global Kudo map and init global variables with
// stuff imported from elsewhere.
  Kudo    = kudo_scope;
  ui      = Kudo.ui;
  l       = ui.l;
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
  // ui1twit stuff
  TwitterUser = Kudo.TwitterUser;
  // Exports
}


function page_twittrust( page_name, p1, p2, p3 ){
  
  var session = this.session;
  var persona = session.visitor;
  
   // Header
  var that = this;
  this.set( 
    ui.page_style( "twittrust" ),
    ui.page_header(
      _,
      ui.link_to_twitter_filter( "#corse", "", true /* no_icon */ ),
      _
    )
  );
  
  var target;
  var name = "all"
  if( p1 && p1 !== "all" ){
    target = TwitterUser.find( p1 );
    name = target.screen_name;
  }
  
  var top_n;
  top_n = parseInt( p2, 10 );
  if( !top_n ){
    top_n = 100;
  }
  
  var depth;
  depth = parseInt( p3, 10 );
  if( !depth ){
    depth = 2;
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
  this.open_div( "top_twitter", "", "hide" ).h2(
    "Le palmar&egrave;s des comptes Twitter en Corse"
  ).push(
    " - "
    + " " + ui.link_to_page( page_name, name +      " 10 " +  depth,  " 10" )
    + " " + ui.link_to_page( page_name, name +     " 100 " +  depth,   "100" )
    + " " + ui.link_to_page( page_name, name +    " 1000 " +  depth,  "1000" )
    + " " + ui.link_to_page( page_name, name + " " + top_n +   " 1",   "x1" )
    + " " + ui.link_to_page( page_name, name + " " + top_n +   " 2",   "x2" )
    + " " + ui.link_to_page( page_name, name + " " + top_n +   " 3",   "x3" )
    + " " + ui.link_to_page( page_name, name + " " + top_n +  " 10",  "x10" )
    + " " + ui.link_to_page( page_name, name + " " + top_n + " 100", "x100" )
    
    + " - " + ui.link_to_page( "delegates", "all all", l( "votes" ) ),
    "<br>"
  );
  
  var trust = Kudo.TrustActor.get_ranked( top_n, depth, target );
  
  var actors = trust.actors;
  if( !actors ){
    trace( "BUG? bad actor list from .get_ranked()" );
    actors = [];
  }
  var community_size = Kudo.TwitterUser.get_community_size();
  var actor;
  var data;
  for( var ii = 0 ; ii < actors.length ; ii++ ){
    actor = actors[ ii ];
    this.push( 
      "<br>" + ( ii + 1 ),
      " - "
    );
    data = actor.twitter_user_data;
    if( data ){
      this.push( 
        ui.link_to_twitter_user( 
          actor.screen_name,
          actor.twitter_user_data.name
        ), " "
      );
    }else{
      this.push( "" + actor.id, ". " );
    }
    if( actor.friends_count ){
      this.push( actor.friends_count, " amis" );
    }else{
      this.push( "sans amis" );
    }
    var percent 
    = Math.round( actor.followers_count * 10 * 100 / community_size  ) / 10;
    if( actor.followers_count ){
      this.push( ", suivi &agrave; ", percent, "%" );
    }
  }
  
  this.close_div();
  
  this.close_div();
  
  this.push(  "<br>", ui.page_footer() );

}


exports.start = function( kudo_scope ){
  
  // Import stuff from main.js, shared with ui1_server defined in ui1core.js
  process_kudo_imports( kudo_scope );
  
  Kudo.ui.register_page( "twittrust", page_twittrust );
  
};
