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

var Kudo;
var map;
var l8;
var de;
var nde = false;
var trace;
var bug;
var mand;
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
  // ui1twit stuff
  TwitterUser = Kudo.TwitterUser;
}


/* --------------------------------------------------------------------------
 *  TrustActor class
 */

var AllTrustActors;

function TrustActor( twitter_user ){
  de&&mand( twitter_user && twitter_user.id );
  AllTrustActors[ twitter_user.id ] = this;
  this.twitter_user = twitter_user;
  this.id = twitter_user.id;
  // Compute intensive extended list of followers is cached
  this.followers_depth = 0;
  this.time_followers = 0;
  this.followers = [];
  this.followers_count = 0;
  this.pagerank_score = 0;
  this.pagerank_rank = 0; // not ranked
  this.followers_rank = 0;
  this.friends_rank = 0;
  this.twitter_followers_rank = 0;
  this.twitter_friends_rank = 0;
  this.score = 0;
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
    // DoneDepth = 0;
    // Chain = [];
  }
  if( depth <= 0 )return seen_table;
  
  if( false && DoneDepth > 99 ){
    trace( "BUG? super long followers chain" );
    for( ii = 0 ; ii < Chain.length ; ii++ ){
      trace( "" + Chain[ ii ] + " followes " );
    }
    debugger;
  }
  
  var followers = this.twitter_user.get_followers();
  var actor;
  for( ii = 0 ; ii < followers.length ; ii++ ){
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

var PagerankIsRunning = false;


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
  
  // Use cached result
  var rank = CachedPagerank;
  
  // Special case when called for the first time
  var first_time = false;
  if( !rank ){
    first_time = true;
    CachedPagerank = [];
    TimeCachedPagerank = 0;
    rank = CachedPagerank;
  }
  
  // Update cache when needed, async
  if( first_time
  || ( TimeCachedPagerank < TwitterUser.get_time_last_change()
    && !PagerankIsRunning )
  ){
  
    PagerankIsRunning = true;
    
    // Add nodes & arrows
    var count = 0;
    for( ii = 0 ; ii < actors.length ; ii++ ){
      actor = actors[ ii ];
      user  = actor.twitter_user;
      if( !user.is_member )continue;
      ( function( user ){
        setTimeout( function(){
          friends = user.get_friends();
          for( jj = 0 ; jj < friends.length ; jj++ ){
            friend = friends[ jj ];
            if( !friend.is_active() )continue;
            graph.addLink( user.id, friend.id );
            count++;
          }
        }, ii * 5 );
      } )( user );
    }
    
    setTimeout( function(){
      
      var now2 = l8.update_now();
      
      trace( 
        "Pagerank, built graph with", count, "arrows",
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
      
      // Update actor's score based on pagerank results
      var list = [];
      for( ii = 0 ; ii < actors.length ; ii++ ){
        actor = actors[ ii ];
        actor.pagerank_score = rank[ actor.id ] || 0;
        actor.pagerank_rank = 0;
        list.push( actor );
      }
      list.sort( function( a, b ){
        var a_score = a.pagerank_score;
        var b_score = b.pagerank_score;
        if( a_score <  b_score )return  1;
        if( a_score == b_score )return  0;
        return                         -1;
      });
      for( var ii = 0 ; ii < list.length ; ii++ ){
        list[ ii ].pagerank_rank = ii + 1;
      }
      
      PagerankIsRunning = false;
  
    }, actors.length * 5 + 1000 );
  }
  
  return rank;
  
};


TrustActor.prototype.get_rank = function(){
  return this.pagerank_rank;
};
  

TrustActor.get_ranked = function( max, depth ){
  
  if( !max ){
    max = 100;
  }
  
  if( !depth ){
    depth = 1;
  }
  
  // Some criterias are sub criterias
  var other_list;
  if( depth === "followers" 
  ||  depth === "rate"
  ||  depth === "efficiency"
  ){
    other_list = TrustActor.get_ranked( max, 1 ).actors;
  }
  
  if( depth === "pagerank" ){
    TrustActor.pagerank();
  }
  
  var list = TrustActor.get_all();
  var actor;  // a TrustActor
  var user;   // a TwitterUser
  var top_user;
  var top = 0;
  var total = 0;
  var filtered_list = [];
  var community_size = TwitterUser.get_community_size();
  
  for( var ii = 0 ; ii < list.length ; ii++ ){
    
    // trace( "Compute followers for " + list[ ii ] + ",", ii, "/", list.length );
    actor = list[ ii ];
    user = actor.twitter_user;
    
    // Skip the community itself
    // if( user.screen_name === "suvranu" )continue;
    
    // Skip inactive users
    if( depth !== "followers" && !user.is_active() )continue;
    
    // Skip actors with too few tweets
    // if( user.twitter_user_data.statuses_count < 500 )continue;
    
    // Depending on criteria, weekly rate of posts & likes
    if( depth === "rate" ){
      actor.score = user.action_rate;
      
    // Criteria, number of direct twitter followers
    }else if( depth === "followers" ){
      actor.score = user.twitter_user_data.followers_count;
    
    // Criteria, ratio of pagerank over followers
    }else if( depth === "efficiency" ){
      actor.score
      = actor.pagerank_score
      / ( 10 * ( user.followers_count / community_size ) );
      if( actor.twitter_followers_rank > actor.pagerank_rank ){
        actor.score = actor.twitter_followers_rank / actor.pagerank_rank;
      }else{
        actor.score = 0;
      }
      
    // Criteria, adjusted number of twitter followers + rate 
    }else if( depth === "locality" ){
      actor.score 
      = user.twitter_user_data.followers_count * user.locality_factor;
      actor.score += ( actor.score * ( user.action_rate / 1000 ) );
    
    // Pagerank style  
    }else if( depth === "pagerank" ){
      // ToDo: compute pagerank score
      actor.score = actor.pagerank_score;
      
    // followers of followers + locality bonus + rate
    }else{
      // Update each actor's extended followership
      actor.get_followers( depth );
      // ajust depending on locality factor and rate of actions
      actor.score = actor.followers.length;
      actor.score += ( actor.score / 2 ) * user.locality_factor;
      actor.score += ( actor.score * ( user.action_rate / 1000 ) );
      total += actor.score;
    }
    
    // Skip unranked actors
    if( actor.score === 0 )continue;
    
    // Skip actors with not enough local followers
    if( user.followers_count < 10 )continue;
    
    // Track a bug
    if( user.twitter_user_data.followers_count 
      < user.followers_count
    ){
      // TODO: FIXME
      nde&&bug( 
        "BUG, more users than twitter reports for " + user + ",",
        user.followers_count,
        "vs", user.twitter_user_data.followers_count 
      );
    }

    // Skip if less than 30 followers
    if( false && user.twitter_user_data.followers_count < 30 ){
      continue;
    }
    
    filtered_list.push( actor );

    // Remember actors with best score
    if( actor.score > top ){
      top_user = actor;
      top = top_user.score;
    }
    
  }
  
  list = filtered_list;
  
  // When looking for the rate of twitter followers, keep those with influence
  if( depth === "rate"
  ||  depth === "followers"
  ||  depth === "efficiency"
  ){
    filtered_list = [];
    for( ii = 0 ; ii < list.length ; ii++ ){
      if( other_list.indexOf( list[ ii ] ) == -1 )continue;
      filtered_list.push( list[ ii ] );
      // if( filtered_list.length === max )break;
    }
    list = filtered_list;
  }
  
  // Sort actors
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
    diff = list[ ii ].score - mean;
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
    }
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
  
  // Update ranking
  for( ii = 0 ; ii < list.length ; ii++ ){
    if( depth === "followers" ){
      list[ ii ].twitter_followers_rank = ii + 1;
    }
  }
  
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
 *  TrustTweet class
 */

var AllTweets; // a map()


function TrustTweet( status ){
  this.id = status.id;
  this.status = status;
  this.actor = AllTrustActors[ status.author_id ];
  this.score = 0;
  AllTweets[ this.id ] = this;
}


TrustTweet.add = function( status ){
  if( AllTweets[ status.id ] ){
    AllTweets[ status.id ].status = status;
    return;
  }
  new TrustTweet( status );
};


TrustTweet.remove = function( status ){
  if( !AllTweets[ status.id ] )return;
  delete AllTweets[ status.id ];
};


TrustTweet.get_ranked = function( top_n, criteria, target ){
  
  var now = l8.update_now();
  var size = TwitterUser.get_community_size();
  var list = [];
  var score;
  var age;
  var limit = 0;
  
  if( criteria === "t24h" ){
    limit = now - 24 * 3600 * 1000;
  }else if( criteria === "t7j" ){
    limit = now - 7 * 24 * 3600 * 1000;
  }else if( criteria === "t28j" ){
    limit = now - 28 * 24 * 3600 * 1000;
  }
  
  var four_weeks = 4 * 7 * 24 * 3600 * 1000;
  
  for( var idx in AllTweets ){
    var tweet = AllTweets[ idx ];
    if( tweet.status.favorite_count ){
      // Skip old tweets
      if( limit && tweet.status.time_created < limit )continue;
      // Skip tweets by user without much followers
      var author = TwitterUser.find_by_id( tweet.actor.id );
      if( author.followers_count < 10 )continue;
      score  = tweet.status.retweet_count;
      // score *= ( size / tweet.actor.twitter_user.followers_count ) / 100;
      // score *= tweet.actor.twitter_user.locality_factor;
      score += tweet.status.favorite_count;
      // score += tweet.status.retweet_count;
      age = now - tweet.status.time_created;
      // Reduced by half after 2 weeks
      score *= (four_weeks - age ) / four_weeks;
      score *= tweet.actor.pagerank_score;
      tweet.score = score;
      list.push( tweet );
    }
  }
  
  // Sort based on score
  list.sort( function( a, b ){
     var a_score = a.score;
     var b_score = b.score;
     if( a_score <  b_score )return  1;
     if( a_score == b_score )return  0;
     return                         -1;
  } );
  
  return list.slice( 0, top_n );

};


/* ---------------------------------------------------------------------------
 *  Top friends management
 *  This is about external friends of the community
 */

var AllExternalFriends;


function ExternalFriend( id, screen_name ){
  this.id = id;
  this.screen_name = screen_name;
  this.followers_count = 0;
  this.followers = map();
  AllExternalFriends[ id ] = this;
  return this;
}


ExternalFriend.find = function( id, screen_name ){
  var friend = AllExternalFriends[ id ];
  if( !friend ){
    friend = new ExternalFriend( id, screen_name );
  }
  return friend;
};


ExternalFriend.prototype.add_follower = function( id, time ){
  if( this.followers[ id ] )return;
  this.followers[ id ] = time || l8.now;
  this.followers_count++;
  return this;
};


ExternalFriend.prototype.bulk_add_followsers = function( timed_ids ){
  var ii = 0;
  var len = timed_ids.length;
  var id;
  var time;
  var age;
  var now = l8.update_now();
  while( ii < len ){
    id = timed_ids[ ii++ ];
    time = timed_ids[ ii++ ];
    age = now - time;
    if( age > 7 * 24 * 3600 * 1000 )continue;
    this.add_follower( id, time );
  }
  return this;
};


ExternalFriend.prototype.get_bulk_followers = function(){
  var now = l8.update_now();
  var list = [];
  var time;
  var age;
  var followers = this.followers;
  for( var idx in followers ){
    time = followers[ idx ];
    age = now - time;
    if( age > 7 * 24 * 3600 * 1000 )continue;
    list.push( idx );
    list.push( time );
  }
  return list;
};


ExternalFriend.get_bulk = function(){
  var list = [];
  var friend;
  for( var idx in AllExternalFriends ){
    friend = AllExternalFriends[ idx ];
    if( friend.followers_count === 0 )continue;
    list.push( {
      id: friend.id,
      screen_name: friend.screen_name,
      followers: friend.get_bulk_followers()
    } );
  }
  return {
    friends: list
  };
};


ExternalFriend.set_bulk = function( data ){
  if( !data )return;
  var friends = data.friends;
  if( !friends )return;
  var friend_data;
  var friend;
  for( var ii = 0 ; ii < friends.length ; ii++ ){
    friend_data = friends[ ii ];
    friend = ExternalFriend.find( friend_data.id, friend_data.screen_name );
    friend.add_bulk_followers( friend_data.followers );
  }
};


ExternalFriend.get_all = function(){
  var list;
  var friend;
  for( var idx in AllExternalFriends ){
    friend = AllExternalFriends[ idx ];
    if( friend.followers_count === 0 )continue;
    list.push( friend );
  }
  list.sort( function( a, b ){
    var a_count = a.followers_count;
    var b_count = b.followers_count;
    if( a_count <  b_count )return  1;
    if( a_count == b_count )return  0;
    return                         -1;
  } );
  return list;
};


/* ---------------------------------------------------------------------------
 *  Start monitoring. Main entry point. Called from ui1.js at startup.
 */
 
exports.start = function( ui1_server ){
  
  // Import stuff from main.js, shared with ui1_server defined in ui1core.js
  process_kudo_imports( ui1_server.get_kudo_scope() );
  
  AllTrustActors = map();
  AllTweets = map();
  
  // Exports
  Kudo.TrustActor  = TrustActor;
  Kudo.TrustTweet  = TrustTweet;
  Kudo.TrustFriend = ExternalFriend;
  
  // Schedule initial async update of pagerank
  setTimeout( TrustActor.pagerank, 60 * 1000 );
  
  console.log( "Ready to listen for Twitter favorites" );
  
};
