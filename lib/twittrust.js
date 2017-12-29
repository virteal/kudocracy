// twittrust.js
//    liquid democracy twitter likes
//
// dec 23 2017 by jhr
//
// Sort likes according to automatic likes by followers


// Whenever someone with followers likes a tweet, a tweet counter attached
// to the tweet gets incremented according to the total number of followers
// including followers of followers.
// These followers are not the twitter defined ones, it's the kudocracy ones.

// When a user logs in its recent favorites are collected. For each of them,
// a counter is attached and incremented by the total number of followers,
// both direct and indirect.
//
// When a user logs in a list of all her friends is built and favorites from
// all these friends are collected. A per tweet ranking score is updated based
// on the number of direct and indirect likes.
//
// The same processes are repeated forever at some low frequency. All data are
// cached to avoid excessive usage of twitter's API.

"use strict";

/*
 *  Some global imports
 */

var Ui1Server; 
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
var TwitterUser;


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
  // ui1twit stuff
  TwitterUser = Kudo.TwitterUser;
  // Exports
  Kudo.TrustActor = TrustActor;
}

var AllTrustActors = {};

function TrustActor( twitter_user ){
  AllTrustActors[ twitter_user.id ] = this;
  this.twitter_user = twitter_user;
  this.id = twitter_user.id;
}


TrustActor.register = function( twitter_user ){
  var actor = AllTrustActors[ twitter_user.id ];
  if( actor )return actor;
  return new TrustActor( twitter_user );
};


TrustActor.get_all = function(){
  var list = [];
  for( var key in AllTrustActors ){
    var actor = AllTrustActors[ key ];
    if( !actor )continue;
    list.push( actor );
  }
  return list;
};


TrustActor.find = function( id ){
  return AllTrustActors[ id ];
};


TrustActor.prototype.toString = function(){
  return "Trust/" + this.twitter_user;
};



var SeenMap;
var SeenTable;

TrustActor.prototype.get_friends = function(){
  var top = false;
  if( !SeenMap ){
    SeenMap = {};
    SeenTable = [];
    top = true;
  }
  if( SeenMap[ this.id ] )return SeenTable;
  SeenMap[ this.id ] = this;
  SeenTable.push( this );
  var friends = this.twitter_user.get_friends();
  var actor;
  for( var ii = 0 ; ii < friends.length ; ii++ ){
    var actor = AllTrustActors[ friends[ ii ].id ];
    if( !actor ){
      nde&&bug( "BUG? missing trust actor for " + friends[ ii ] );
      continue;
    }
    AllTrustActors[ friends[ ii ].id ].get_friends();  
  }
  if( top ){
    SeenMap = null;
    this.friends = SeenTable;
  }
  return SeenTable;
};
  

TrustActor.prototype.get_followers = function( seen_map, seen_table ){

  // Cache result for 10 seconds  
  var now = l8.update_now();
  if( this.time_followers
  && ( now - this.time_followers ) < 10 * 1000
  )return this.followers;
  
  var top = false;
  if( !seen_map ){
    top = true;
    seen_map = {};
    seen_table = [];
  }
  if( seen_map[ this.id ] )return seen_table;
  
  var start = seen_table.length;

  seen_map[ this.id ] = this;
  seen_table.push( this );
  
  var friends = this.twitter_user.get_followers();
  var actor;
  for( var ii = 0 ; ii < friends.length ; ii++ ){
    actor = AllTrustActors[ friends[ ii ].id ];
    if( !actor ){
      nde&&bug( "BUG? missing trust actor for " + friends[ ii ] );
      continue;
    }
    AllTrustActors[ friends[ ii ].id ].get_followers( seen_map, seen_table );  
  }
  
  if( top ){
    this.followers = seen_table.slice( start );
    this.time_followers = l8.update_now();
  }
  
  return this.followers;
  
};
  

TrustActor.get_ranked = function( max ){
  
  if( !max ){
    max = 100;
  }
  
  var list = TrustActor.get_all();
  var actor;
  
  for( var ii = 0 ; ii < list.length ; ii++ ){
    list[ ii ].get_followers();
  }
  
  list.sort( function( a, b ){
     var a_count = a.followers.length;
     var b_count = b.followers.length;
     if( a_count <  b_count )return -1;
     if( a_count == b_count )return  0;
     return                          1;
  } );
  
  var limit = list.length;
  if( limit > max ){
    limit = max;
  }
  var buffer = "Top trust:";
  for( ii = 0 ; ii < limit ; ii++ ){
    buffer += " " + ii + "-" + list[ ii ].twitter_user.screen_name;
  }
  trace( buffer );
  
  return list;

};



/* ---------------------------------------------------------------------------
 *  Start monitoring. Main entry point. Called from ui1.js at startup.
 */
 
exports.start = function( ui1_server ){
  
  // Import stuff from main.js, shared with ui1_server defined in ui1core.js
  Ui1Server = ui1_server;
  process_kudo_imports( ui1_server.get_kudo_scope() );
  
  console.log( "Ready to listen for Twitter favorites" );
  
};
