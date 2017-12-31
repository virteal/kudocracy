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
  de&&mand( twitter_user && twitter_user.id );
  AllTrustActors[ twitter_user.id ] = this;
  this.twitter_user = twitter_user;
  this.id = twitter_user.id;
  // Compute intensive extened list of followers is cached
  this.followers_depth = 0;
  this.time_followers = 0;
  this.followers;
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

TrustActor.prototype.get_followers = function( depth, seen_map, seen_table  ){
// Return list of follower actors, including followers of followers.

  var now = l8.update_now();
  if( !depth ){
    depth = 2;
  }
  
  // Cache result for one minute  
  // ToDo: could manage a "touched" flag when some relationship is changed
  if( this.followers_depth === depth
  &&  this.time_followers
  && ( now - this.time_followers ) < 60 * 1000
  ){
    if( seen_table ){
      var list = this.followers;
      var item;
      for( var ii = 0 ; ii < list.length ; ii++ ){
        item = list[ ii ];
        if( seen_map[ item.id ] )continue;
        seen_map[ item.id ] = item;
        seen_table.push( item );
      }
    }
    return this.followers;
  }
  
  // If top level, start new list
  var top = false;
  if( !seen_map ){
    top = true;
    seen_map = {};
    seen_table = [];
    depth = 3;
  }
  depth--;
  if( !depth )return seen_table;
  
  var friends = this.twitter_user.get_followers();
  var actor;
  for( var ii = 0 ; ii < friends.length ; ii++ ){
    actor = AllTrustActors[ friends[ ii ].id ];
    if( !actor ){
      nde&&bug( "BUG? missing trust actor for " + friends[ ii ] );
      continue;
    }
    if( seen_map[ actor.id ] )continue;
    // if never seen actor, add to list
    seen_map[ actor.id ] = actor;
    seen_table.push( this );
    if( seen_table.length > 3000 ){
      trace( "BUG, excessive number of seen actors" );
      break;
    }
    // Also add followers of actor
    actor.get_followers( depth - 1, seen_map, seen_table );
  }
  
  if( !top )return;
  
  // Save result in cache
  this.followers_depth = depth;
  this.followers = seen_table;
  // trace( "Followers for " + this + ":", seen_table.length );
  this.time_followers = l8.update_now();
  
  return this.followers;

};
  

TrustActor.get_ranked = function( max, depth ){
  
  if( !max ){
    max = 100;
  }
  
  var list = TrustActor.get_all();
  
  var user;
  var top_user;
  var top = 0;
  var total = 0;
  
  var filtered_list = [];
  
  for( var ii = 0 ; ii < list.length ; ii++ ){
    // trace( "Compute followers for " + list[ ii ] + ",", ii, "/", list.length );
    user = list[ ii ];
    // Update each actor's followership
    user.get_followers( depth );
    total += user.followers.length;
    // Keep only actors whose name is known, not just screen_name
    if( user.twitter_user.twitter_user_data ){
      filtered_list.push( user );
    }
    // trace( "Number of followers: ", list[ ii ].followers.length );
    // Remember actors with most followers
    if( user.followers.length > top ){
      top_user = user;
      top = top_user.followers.length;
    }
  }
  
  list = filtered_list;
  
  // Sort actors based on number of extended followers and locality factor
  list.sort( function( a, b ){
     var a_count = a.followers.length * a.twitter_user.locality_factor;
     var b_count = b.followers.length * b.twitter_user.locality_factor;
     if( a_count <  b_count )return  1;
     if( a_count == b_count )return  0;
     return                         -1;
  } );
  
  
  // Compute variance & standard deviation
  var mean = total / list.length;
  var total_diff = 0;
  var diff;
  for( ii = 0 ; ii < list.length ; ii++ ){
    diff = list[ ii ].followers.length - mean;
    total_diff += diff * diff;
  }
  var variance = total_diff / list.length;
  var std_dev  = Math.sqrt( variance );
  
  function round( n ){
    var r = Math.round( n * 10 ) / 10;
    return r;
  }
  
  function percentile( n ){
    var idx = Math.ceil( list.length * ( 100 - n ) / 100 );
    if( idx > list.length ){
      idx = list.length;
    };
    if( !list[ idx ] ){
      return 0;
    }
    return list[ idx ].followers.length;
  }
  
  var r = {
    top: top_user,
    top_followers: top,
    mean: round( total / list.length ),
    std_dev: round( std_dev ),
    variance: round( variance ),
    median: percentile( 50 ),
    percentiles: [ 0 ],
    actors: [],
    count: list.length
  };
  
  for( ii = 1 ; ii < 100 ; ii++ ){
    r.percentiles.push( percentile( ii ) );
  }
  
  trace(
    "Top user is " + top_user, "with", top, "followers.",
    "Mean:", round( total / list.length ),
    "Std dev:", round( std_dev ),
    "Variance:", round( variance ),
    "Median:", percentile( 50 ),
    "98th:",  percentile( 98 ),
    "95th:",  percentile( 95 ),
    "90th:",  percentile( 90 ),
    "80th:",  percentile( 80 ),
    "20th:",  percentile( 20 ),
    "15th:",  percentile( 15 ),
    "10th:",  percentile( 10 )
  );
  
  var limit = list.length;
  if( limit > max ){
    limit = max;
  }
  var buffer = "Top " + max + " trusted actors:";
  for( ii = 0 ; ii < limit ; ii++ ){
    r.actors.push( list[ ii ].twitter_user );
    buffer += " " + ii + "-" + list[ ii ].twitter_user.screen_name;
  }
  trace( buffer );
  
  return r;

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
