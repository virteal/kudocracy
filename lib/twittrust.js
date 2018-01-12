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
var map;
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
  map     = Kudo.map;
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

var AllTrustActors;

function TrustActor( twitter_user ){
  de&&mand( twitter_user && twitter_user.id );
  AllTrustActors[ twitter_user.id ] = this;
  this.twitter_user = twitter_user;
  this.id = twitter_user.id;
  // Compute intensive extened list of followers is cached
  this.followers_depth = 0;
  this.time_followers = 0;
  this.followers = [];
  this.followers_count = 0;
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



var TracedUser;
var DoneDepth;
var Chain;

TrustActor.prototype.get_followers = function( depth, seen_map, seen_table  ){
// Return list of follower actors, including followers of followers.

  if( arguments.length === 0 ){
    depth = 2;
  }

  var now = l8.now;
  
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
    seen_map = map();
    seen_table = [];
    TracedUser = this;
    // DoneDepth = 0;
    // Chain = [];
  }
  if( depth <= 0 )return seen_table;
  
  if( false && DoneDepth > 99 ){
    trace( "BUG? super long followers chain" );
    for( var ii = 0 ; ii < Chain.length ; ii++ ){
      trace( "" + Chain[ ii ] + " followes " );
    }
    debugger;
  }
  
  var followers = this.twitter_user.get_followers();
  var actor;
  for( var ii = 0 ; ii < followers.length ; ii++ ){
    actor = AllTrustActors[ followers[ ii ].id ];
    if( !actor ){
      nde&&bug( "BUG? missing trust actor for " + followers[ ii ] );
      continue;
    }
    if( seen_map[ actor.id ] )continue;
    // if never seen actor, add to list
    seen_map[ actor.id ] = actor;
    if( !seen_map[ actor.id ] ){
      trace( "BUG? failed addition of " + actor );
      debugger;
    }
    seen_table.push( this );
    if( seen_table.length > 3000 ){
      trace( "BUG, excessive number of seen actors" );
      break;
    }
    // Also add followers of actor if required
    if( ( depth - 1 ) > 0 ){
      // DoneDepth++;
      // Chain.push( actor );
      actor.get_followers( depth - 1, seen_map, seen_table );
      // Chain.pop();
      //DoneDepth--;
    }
  }
  
  if( !top )return;
  
  // Save result in cache
  this.followers_depth = depth;
  this.followers = seen_table;
  this.followers_count = seen_table.length;
  // trace( "Followers for " + this + ":", seen_table.length );
  this.time_followers = l8.now;
  
  return this.followers;

};


var CachedPagerank;
var TimeCachedPagerank = 0;

TrustActor.pagerank = function(){
  
  // I use https://github.com/anvaka/ngraph.pagerank
  var graph = require('ngraph.graph')();
  
  // Add all links
  var actors = TrustActor.get_all();
  var actor;
  var user;
  var friends;
  var friend;
  var ii;
  var jj;
  
  var now = l8.update_now();
  
  // Use cached result when up to date
  var rank = CachedPagerank;
  
  // Or else compute it
  if( !rank
  ||  TimeCachedPagerank > TwitterUser.get_time_last_change() 
  ){
  
    // Add all nodes & arrows
    var count = 0;
    for( ii = 0 ; ii < actors.length ; ii++ ){
      actor = actors[ ii ];
      user  = actor.twitter_user;
      friends = user.get_friends();
      for( jj = 0 ; jj < friends.length ; jj++ ){
        friend = friends[ jj ];
        graph.addLink( user.id, friend.id );
        count++;
      }
    }
    
    var now2 = l8.update_now();
    
    // This is the slow part
    trace( 
      "Built graph with", count, "arrows",
      "for", actors.length, "actors",
      "in", now2 - now, "ms"
    );
    
    var pagerank = require( 'ngraph.pagerank' );
    var internal_pump_probability = 0.5; // favor consensus, 0.85 favors news
    var precision = 0.00001;
    rank = pagerank( graph, internal_pump_probability, precision );
    
    var now3 = l8.update_now();
    trace( "Computed Pagerank in", now3 - now2, "ms" );
  
    CachedPagerank = rank;
    TimeCachedPagerank = now3;
  }
  
  // Update actor's score based on pagerank results
  for( ii = 0 ; ii < actors.length ; ii++ ){
    actor = actors[ ii ];
    actor.score = rank[ actor.id ];
  }
  
};
  

TrustActor.get_ranked = function( max, depth ){
  
  if( !max ){
    max = 100;
  }
  
  var list = TrustActor.get_all();

  var actor;  // a TrustActor
  var user;   // a TwitterUser
  var top_user;
  var top = 0;
  var total = 0;
  
  if( !depth ){
    depth = 1;
  }
  
  // Some criterias are sub criterias
  var other_list;
  if( depth === "followers" 
  ||  depth === "rate"
  ){
    other_list = TrustActor.get_ranked( max, 1 ).actors;
  }
  
  if( depth === "pagerank" ){
    TrustActor.pagerank();
  }
  
  var filtered_list = [];
  
  for( var ii = 0 ; ii < list.length ; ii++ ){
    
    // trace( "Compute followers for " + list[ ii ] + ",", ii, "/", list.length );
    actor = list[ ii ];
    user = actor.twitter_user;
    
    // Skip the community itself
    if( user.screen_name === "suvranu" )continue;
    
    // Skip inactive users
    // if( !user.is_active() )continue;
    
    // Skip actors with too few tweets
    // if( user.twitter_user_data.statuses_count < 500 )continue;
    
    // Depending on criteria, weekly rate of posts & likes
    if( depth === "rate" ){
      actor.score = user.action_rate;
      
    // Criteria, number of direct twitter followers
    }else if( depth === "followers" ){
      actor.score = user.twitter_user_data.followers_count;
    
    // Criteria, adjusted number of twitter followers + rate 
    }else if( depth === "locality" ){
      actor.score 
      = user.twitter_user_data.followers_count * user.locality_factor;
      actor.score += ( actor.score * ( user.action_rate / 1000 ) );
    
    // Pagerank style  
    }else if( depth === "pagerank" ){
      // ToDo: compute pagerank score
      
    // Main criteria, followers of followers + locality bonus + rate
    }else{
      // Update each actor's extended followership
      actor.get_followers( depth );
      // ajust depending on locality factor and rate of actions
      actor.score = actor.followers.length;
      actor.score += ( actor.score / 2 ) * user.locality_factor;
      actor.score += ( actor.score * ( user.action_rate / 1000 ) );
      total += actor.score;
    }
    
    // Skip actors with too followers
    if( user.followers_count < 30 )continue;
    
    // Track a bug
    if( user.twitter_user_data.followers_count 
      < user.followers_count
    ){
      trace( 
        "BUG, more users than twitter reports for " + user + ",",
        user.followers_count,
        "vs", user.twitter_user_data.followers_count 
      );
    }

    // Skip if less than 30 followers
    if( user.twitter_user_data.followers_count >= 30 ){
      filtered_list.push( actor );
    }

    // Remember actors with best score
    if( actor.score > top ){
      top_user = actor;
      top = top_user.score;
    }
    
  }
  
  list = filtered_list;
  
  // When looking for the rate or twitter followers, keep those with influence
  if( depth === "rate"
  ||  depth === "followers"
  ){
    filtered_list = [];
    for( ii = 0 ; ii < list.length ; ii++ ){
      if( other_list.indexOf( list[ ii ] ) == -1 )continue;
      filtered_list.push( list[ ii ] );
      if( filtered_list.length === max )break;
    }
    list = filtered_list;
  }
  
  // Sort actors based on number of extended followers and locality factor
  list.sort( function( a, b ){
     var a_score = a.score;
     var b_score = b.score;
     if( a_score <  b_score )return  1;
     if( a_score == b_score )return  0;
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
    "Mean:",     round( total / list.length ),
    "Std dev:",  round( std_dev ),
    "Variance:", round( variance ),
    "Median:",   percentile( 50 ),
    "98th:",     percentile( 98 ),
    "95th:",     percentile( 95 ),
    "90th:",     percentile( 90 ),
    "80th:",     percentile( 80 ),
    "20th:",     percentile( 20 ),
    "15th:",     percentile( 15 ),
    "10th:",     percentile( 10 )
  );
  
  var limit = list.length;
  if( limit > max ){
    limit = max;
  }
  //var buffer = "Top " + max + " trusted actors:";
  for( ii = 0 ; ii < limit ; ii++ ){
    r.actors.push( list[ ii ] );
    // buffer += " " + ii + "-" + list[ ii ].twitter_user.screen_name;
  }
  // trace( buffer );
  
  return r;

};


/* ---------------------------------------------------------------------------
 *  Start monitoring. Main entry point. Called from ui1.js at startup.
 */
 
exports.start = function( ui1_server ){
  
  // Import stuff from main.js, shared with ui1_server defined in ui1core.js
  Ui1Server = ui1_server;
  process_kudo_imports( ui1_server.get_kudo_scope() );
  
  AllTrustActors = map();
  
  console.log( "Ready to listen for Twitter favorites" );
  
};
