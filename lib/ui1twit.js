//  ui1twit.js
//    First UI for Kudocracy, test/debug UI, HTTP based, Twitter aspects
//
// Dec 4 2014 by @jhr

"use strict";

/*
 *  Some global imports
 */
 
var fs = require( "fs" );

var Ui1Server; 
var Kudo;
var map;
var l8;
var de;
var nde;
var trace;
var bug;
var mand;
var Ephemeral;
var Topic;
var Persona;


function process_kudo_imports( kudo_scope ){
// This function fill the global Kudo map and init global variables with
// stuff imported from elsewhere.
  Kudo    = kudo_scope;
  map     = Kudo.map;
  l8      = Kudo.l8;
  // My de&&bug() and de&&mand() darlings
  de      = true;
  nde     = false;
  trace   = Kudo.trace;
  bug     = trace;
  mand    = Kudo.assert;
  // Ephemeral entities
  Ephemeral  = Kudo.Ephemeral;
  Topic      = Kudo.Topic;
  Persona    = Kudo.Persona;
  // ui1core stuff
  Session    = Kudo.Session;
  // Exports
  Kudo.TwitterUser = TwitterUser;
  Kudo.MonitoredPersona = MonitoredPersona;
}


/* ---------------------------------------------------------------------------
 *  Twitter user class
 */

var AllTwitterUsers;
var CachedListOfUsers; // AllTwittersUser stored as an array
var TwitterUsersByScreenName;
var TwitterUserCount = 0;
var FriendshipsCount = 0;


function TwitterUser( twitter_user_data, persona ){
  
  var now = l8.update_now();
  
  var id = twitter_user_data.id_str || twitter_user_data.id;
  var screen_name = twitter_user_data.screen_name;

  // trace( "Twitter, create user", id );
  this.id = id;
  this.screen_name = screen_name;
  
  if( id ){ 
    AllTwitterUsers[ id ] = this;
    CachedListOfUsers = null;
  }
  if( screen_name ){
    TwitterUsersByScreenName[ screen_name.toLowerCase() ] = this;
  }
  
  if( !id && !screen_name ){
    trace( "BUG, neither id nor screen name in new TwitterUser()" );
    return null;
  }
  
  this.persona = persona; // in main machine, if ever
  
  var machine = Ephemeral.Machine.current;
  this.machines = [ machine ];
  this.persona_by_machine_id = map();
  
  if( persona ){
    this.persona_by_machine_id[ machine.id ] = persona;
    persona._twitter_user = this;
  }
  
  this.is_member = false; // Member of the community
  
  this.deregistered = false; // When deleted twitter user
  
  this.status; // last one
  this.statuses = [];
  
  this.friends = map();
  this.friends_count = 0;
  
  this.followers = map();
  this.followers_count = 0;
  
  this.locality_factor = 0;  // ratio of local followers
  this.action_rate = 0;      // weekly activity, post & likes
  
  this.cached_friends = null;
  this.cached_friend_ids = null;
  this.cached_followers = null;
  this.cached_follower_ids = null;
  
  this.time_friends_collected = 0;
  this.time_last_changed = 0;
  this.time_touched = now;
  this.rank_created = TwitterUserCount;
  this.time_created = now;
  this.age = 0;
  TwitterUserCount++;
  
  if( twitter_user_data.name ){
    this.set_twitter_user_data( twitter_user_data, now );
  }else{
    this.twitter_user_data = null;
    this.time_twitter_user_data = 0;
  }
  
  this.collect_friends();
  
  return this;

}


TwitterUser.register = function( twitter_user_data, persona ){
// Keep a register of seen users. Sometimes I get the screen_name only,
// sometimes I get the id only. Sometimes I get both.

  var now = l8.update_now();
  
  var id = twitter_user_data.id_str || twitter_user_data.id;
  var screen_name = twitter_user_data.screen_name;
  
  if( screen_name === "suvranu" ){
    trace( "Domain", screen_name, "registration" );
  }
  if( false && id && id.length < 8 ){
    trace( "Unusual twitter short id", id, "for", screen_name );
  }
  
  var user;
  var changed = false;
  
  // If user was registered before using the screen name
  if( screen_name ){
    user = TwitterUsersByScreenName[ screen_name.toLowerCase() ];
    if( user && id && user.id !== id ){
      trace( "BUG, inconsistent screen_name & id, try id" );
      user = null;
      debugger;
    }
  }
  
  // If screen name does not match, try using id
  if( id && !user ){
    user = AllTwitterUsers[ id ];
    // Twitter screen names can change over time, adjust
    if( user 
    && screen_name 
    && user.screen_name 
    && user.screen_name !== screen_name
    ){
      // trace( "BUG, inconsistent screen_name & id, update screen name" );
      var other_user = TwitterUsersByScreenName[ screen_name.toLowerCase() ];
      if( other_user ){
        user = other_user;
        AllTwitterUsers[ id ] = other_user;
        CachedListOfUsers = null;
        changed = true;
        trace( "Fix, new" );
      }
      user.screen_name = screen_name;
      TwitterUsersByScreenName[ screen_name.toLowerCase() ] = user;
    }
  }
  
  if( !user )return new TwitterUser( twitter_user_data, persona );
  
  // Update existing user
  
  // trace( "Twitter, update user", id );
  var machine = Ephemeral.Machine.current;
  
  // When id is first known
  if( !user.id && id ){
    user.id = id;
    AllTwitterUsers[ id ] = user;
    CachedListOfUsers = null;
    changed = true;
  }
  
  // When screen name is first known
  if( !user.screen_name && screen_name ){
    user.screen_name = screen_name;
    TwitterUsersByScreenName[ screen_name.toLowerCase() ] = user;
    changed = true;
  }
  
  if( persona ){
    user.persona_by_machine_id[ machine.id ] = persona;
    persona._twitter_user = user; // _ to please Ephemeral
  }
  
  // When potential new twitter data about the user
  if( twitter_user_data.name ){
    user.set_twitter_user_data( twitter_user_data );
    changed = true;
  }
  
  if( user.machines.indexOf( machine ) === -1 ){
    user.machines.push( machine );
    user.persona_by_machine_id[ machine.id ] = persona;
  }
  
  if( changed ){
    user.time_touched = now;
  }
  
  user.collect_friends();
  
  return user;

};


TwitterUser.get_community = function(){
  return CommunityUser;
};


TwitterUser.prototype.is_community = function(){
  return this === CommunityUser;
};


TwitterUser.get_community_size = function(){
  return TwitterUserCount;
};


TwitterUser.get_community_friendships_count = function(){
  return FriendshipsCount;
};


TwitterUser.get_all = function(){
  if( CachedListOfUsers )return CachedListOfUsers;
  var list = [];
  var users = AllTwitterUsers;
  for( var key in users ){
    var user = users[ key ];
    if( !user )continue;
    list.push( user );
  }
  return CachedListOfUsers = list;
};


TwitterUser.find_persona = function( screen_name, machine ){
  var user = TwitterUsersByScreenName[ screen_name.toLowerCase() ];
  if( !user )return null;
  if( !machine ){
    machine = Ephemeral.Machine.current;
  }
  return user.persona_by_machine_id[ machine.id ];
};


TwitterUser.find = function( id ){
  if( id[0] === "@" ){
    id = id.substring( 1 );
  }
  return TwitterUsersByScreenName[ id.toLowerCase() ];
};


TwitterUser.find_by_id = function( id ){
  if( !id )return null;
  return AllTwitterUsers[ id ];
};


TwitterUser.prototype.toString = function(){
  return "@" + ( this.screen_name || this.id );
};


TwitterUser.prototype.deregister = function( deleted ){
// Called when user is removed by twitter or leaves the community
  if( this.deregistered )return;
  // Don't deregister the community itself
  if( this === CommunityUser )return false;
  // Don't deregister a friend of the community, for a while
  // TODO: fix this
  if( !deleted && CommunityUser.has_friend( this ) && this.screen_name ){
    trace( "Deregister community member " + this );
    de&&mand( this.is_member );
    // return false;
  }
  trace( "Deregistering " + this );
  this.deregistered = true;
  var idx;
  var list = Object.keys( this.friends );
  for( idx in list ){
    this.remove_friend( this.friends[ list[ idx ] ] );
  }
  list = Object.keys( this.followers );
  for( idx in list ){
    this.remove_follower( this.followers[ list[ idx ] ] );
  }
  return true;
};


TwitterUser.prototype.set_twitter_user_data = function( data ){

  var first_time = !this.twitter_user_data;
  
  if( !data ){
    trace( "Null data in .set_twitter_user_data" );
    return;
  }
  if( !data.name ){
    // trace( "Bad data in .set_twitter_user_data()" );
    return;
  }

  this.twitter_user_data = data;
  this.time_twitter_user_data = l8.now;
  
  this.screen_name = data.screen_name;
  TwitterUsersByScreenName[ data.screen_name.toLowerCase() ] = this;

  var created_at = data.created_at;
  if( created_at ){
    var date = new Date( Date.parse( created_at.replace( /( \+)/, ' UTC$1' ) ) );
    var time = date.getTime();
    var age = l8.now - time;
    this.time_created = time;
    // Compute some weekly activity index (since creation)
    var nactions = data.favourites_count + data.statuses_count;
    this.action_rate = ( nactions * 7 * 24 * 60 * 60 * 1000 ) / age;
  }

  // ToDo: compute this elsewhere, in set_twitter_user_data() maybe
  // Locality factor depends on ratio of local followers over total
  var nfollowers = data.followers_count;
  if( !nfollowers ){
    nfollowers = 1;
  }
  if( this.followers_count > nfollowers ){
    trace(
      "BUG, local followers count greater than twitter's count for " + this,
      "is", this.followers_count, "vs", nfollowers
    );
    nfollowers = this.followers_count;
  }
  var ratio = this.followers_count / nfollowers;
  this.locality_factor = ratio;
  
  if( first_time && Kudo.TrustActor ){
    Kudo.TrustActor.register( this );
  }
  
  this.add_status( data.status );

};


TwitterUser.prototype.is_active = function(){
// A user is active if the last know status is less than 10 days old
  var status = this.status;
  if( !status )return false;
  if( this.deregistered )return false;
  var created_at = status.created_at;
  if( !created_at )return false;
  var date = new Date( Date.parse( created_at.replace( /( \+)/, ' UTC$1' ) ) );
  var time = date.getTime();
  var age = l8.now - time;
  var days = Math.ceil( age / ( 24 * 60 * 60 * 1000 ) );
  return days <= 10;
};


TwitterUser.prototype.get_friends = function(){
  
  if( this.cached_friends )return this.cached_friends;

  // Transform map into array
  var list = [];
  var friends = this.friends;
  for( var key in friends ){
    var friend = friends[ key ];
    if( !friend )continue;
    list.push( friend );
  }
  
  this.cached_friends = list;
  
  return list;
};


TwitterUser.prototype.get_followers = function( bool_community ){
  
  // Most of the time, the followers of the community are skipped
  if( !bool_community && this === CommunityUser )return [];
  
  if( this.cached_followers )return this.cached_followers;
  
  // Transform map into array
  var list = [];
  var followers = this.followers;
  for( var key in followers ){
    var follower = followers[ key ];
    if( !follower )continue;
    list.push( follower );
  }
  
  if( this.followers_count !== list.length ){
    trace( 
      "BUG? inconsistant number of followers for " + this + ".",
      this.followers_count, "followers count but", list.length, "table size"
    );
  }
  
  
  this.cached_followers = list;
  
  return list;
  
};


var FriendshipCount = 0;
var FollowershipCount = 0;


TwitterUser.prototype.add_friend = function( twitter_user ){
  
  if( !twitter_user )return this;
  
  if( twitter_user === this ){
    trace( "BUG, cannot add self friendship of " + this );
    return this;
  }
  
  if( this.deregistered ){
    trace( "Cannot add friend " + twitter_user + " to deregistered " + this );
    return this;
  }
  
  if( twitter_user.deregistered ){
    trace( "Cannot add deregistered friend " + twitter_user + " to " + this );
    return this;
  }
  
  var friends = this.friends;
  var new_friend_id = twitter_user.id;
  
  // Avoid duplicate addition
  if( friends[ new_friend_id ] ){
    // Check friend's followership
    if( !twitter_user.followers[ this.id ] ){
      trace(
        "BUG? missing followership for " + this + "'s friend " + twitter_user 
      );
    }
    return this;
  }

  // Add new friend to map of friends  
  friends[ twitter_user.id ] = twitter_user;
  this.friends_count++;
  FriendshipCount++;
  this.cached_friends = null;
  this.cached_friend_ids = null;
  
  // Add this user to the new friend's map of followers
  var followers = twitter_user.followers;
  if( followers[ this.id ] ){
    trace( 
      "BUG? follower presence while adding friend " + twitter_user,
      "to " + this
    );
    if( followers[ this.id ].id !== this.id ){
      trace( "BUG, weird follower " + twitter_user.followers[ this.id ] );
    }

  }else{
    followers[ this.id ] = this;
    twitter_user.followers_count++;
    FollowershipCount++;
    if( twitter_user.twitter_user_data ){
      if( twitter_user.twitter_user_data.followers_count
      <   twitter_user.followers_count )
      {
        nde&&bug(
          "BUG, local followers count greater than twitter's for",
          "" + twitter_user + ",",
          "is", twitter_user.followers_count,
          "vs", twitter_user.twitter_user_data.followers_count
        );
      }
    }
    // Invalidate cached array
    twitter_user.cached_followers = null;
    twitter_user.cached_follower_ids = null;
  }
  
  if( FriendshipCount !== FollowershipCount ){
    trace( 
      "BUG, friendship", FriendshipCount, 
      "vs", "followership", FollowershipCount
    );
  }
  
  de&&mand( this.has_friend( twitter_user ) );
  
  if( this.is_community() ){
    de&&mand( this.screen_name === "suvranu" );
    twitter_user.is_member = true;
    de&&mand( TwitterUser.get_community().has_friend( twitter_user ) );
  }
  
  return this;
  
};


TwitterUser.prototype.add_follower = function( follower ){
  return follower.add_friend( this );
};


TwitterUser.prototype.remove_friend = function( twitter_user ){
  if( !twitter_user )return this;
  var friends = this.friends;
  var old_friend_id = twitter_user.id;
  if( !friends[ old_friend_id ] )return this;
  if( this === TwitterUser.get_community() && !twitter_user.deregistered ){
    trace( "Remove a community member " + twitter_user );
    // trace( "Community is " + TwitterUser.get_community() );
    // trace( "This is " + this );
    de&&mand( this === TwitterUser.get_community() );
    // trace( "Has friend is " + this.has_friend( twitter_user ) );
    de&&mand( this.has_friend( twitter_user ) );
    twitter_user.deregister();
    return;
  }
  delete friends[ twitter_user.id ];
  this.cached_friends = null;
  this.cached_friend_ids = null;
  this.friends_count--;
  if( !twitter_user.followers[ this.id ] ){
    trace( "BUG? missing follower " + this + " of " + twitter_user );
  }else{
    delete twitter_user.followers[ this.id ];
    twitter_user.followers_count--;
    twitter_user.cached_followers = null;
    twitter_user.cached_follower_ids = null;
  }
  de&&mand( !this.has_friend( twitter_user ) );
  return this;
};


TwitterUser.prototype.remove_follower = function( follower ){
  if( !follower )return this;
  follower.remove_friend( this );
  return this;
};


TwitterUser.prototype.has_friend = function( friend ){
  var user = this.friends[ friend.id ];
  if( !user )return false;
  de&&mand( user.id === friend.id );
  de&&mand( user.followers[ this.id ] === this );
  return true;
};


TwitterUser.prototype.has_follower = function( follower ){
  return follower.has_friend( this );
};


/*
 *  Twitter provides an API to list the friends of a user.
 *  Among these friends, some are part of the community and
 *  are remembered as such.
 */

var TimeRateExcess = 0;
var TimeFriendCollectorBusy = 0;
var BacklogSize = 0;
var UpdatedFriendsCount = 0;
var UpdatedFriends;


TwitterUser.prototype.collect_friends = function( dont_schedule ){
  
  if( this.deregistered ){
    trace( "BUG, collect_friend() on deregisterd " + this );
    return true;
  }

  // Don't do anything if work is already scheduled  
  if( this.collect_scheduled )return false;
  
  var that = this;
  var now = l8.update_now();
  
  function reschedule( delay ){
    if( dont_schedule )return false;
    if( that.collect_scheduled )return false;
    var now = l8.update_now();
    if( !delay ){
      // Rate limit of 15 requests within 15 minutes window
      delay = 60 * 1000;
    }
    if( ( now - TimeRateExcess ) < 15 * 60 * 1000 ){
      delay = ( 15 + 5 * Math.random() ) * 60 * 1000;
    }
    BacklogSize++;
    that.collect_scheduled = true;
    setTimeout(
      function(){
        that.collect_scheduled = false;
        BacklogSize--;
        that.collect_friends();
        if( !BacklogSize ){
          trace( "Twitter friends collection backlog is now emppty" );
        }
      },
      delay
    );
    return false;
  }
  
  // Don't do too often for same user
  function uptodate( user ){
    var age_collected = now - user.time_friends_collected;
    return age_collected < 3 * 24 * 3600 * 1000;
  }
  if( uptodate( this ) ){
    if( !UpdatedFriends[ this.id ] ){
      UpdatedFriends[ this.id ] = this;
      UpdatedFriendsCount++;
    }
    return reschedule( 3600 * 1000 );
  }
  
  // Sleep if too much queries
  if( ( now - TimeRateExcess ) < 15 * 60 * 1000 )return reschedule();

  // Only one collect at a time, at most every 10 seconds
  var age_busy = now - TimeFriendCollectorBusy;
  if( age_busy < 10 * 1000 )return reschedule();
  
  // If there exists an active user with more followers, update it first
  if( !dont_schedule ){
    var done = false;
    var list = TwitterUser.get_all();
    var by_twitter_followers = true;
    list.sort( function( a, b ){
      var a_count = a.followers_count;
      if( by_twitter_followers && a.twitter_user_data ){
        a_count = a.twitter_user_data.followers_count;
      }
      if( !a.is_active() ){
        a_count = 0;
      }
      var b_count = b.followers_count;
      if( by_twitter_followers && b.twitter_user_data ){
        b_count = b.twitter_user_data.followers_count;
      }
      if( !b.is_active() ){
        b_count = 0;
      }
      if( a_count <  b_count )return  1;
      if( a_count == b_count )return  0;
      return                         -1;
    });
    if( list[ 0 ].followers_count < list[ list.length - 1 ].followers_count ){
      trace( "BUG, wrong sort order of candidates list" );
    }
    var candidate;
    var oldest = this;
    var this_len = this.followers_count;
    var was_scheduled = false;
    for( var ii = 0 ; ii < list.length ; ii++ ){
      candidate = list[ ii ];
      if( candidate.time_friends_collected < oldest.time_friends_collected ){
        oldest = candidate;
      }
      if( uptodate( candidate ) )continue;
      if( candidate.followers_count < this_len )break;
      was_scheduled = candidate.collect_scheduled;
      candidate.collect_scheduled = false;
      done = candidate.collect_friends( true /* don't reschedule */ );
      if( done )break;
    }
    if( !done && this !== oldest ){
      candidate = oldest;
      was_scheduled = candidate.collect_scheduled;
      candidate.collect_scheduled = false;
      done = candidate.collect_friends( true /* don't reschedule */ );
    }
    if( done ){
      candidate.collect_scheduled = was_scheduled;
      trace( 
        "Prioriy update of " + candidate, done ? "done," : "delayed,",
        "it has", candidate.get_followers().length, "followers"
      );
      return reschedule();
    }
    
    
  }
  
  var twit = AllMonitoredPersonas[ 0 ].twit;

  TimeFriendCollectorBusy = now;
  var previous_time_last_update = that.time_friends_collected;
  that.time_friends_collected = now;
  
  var params = {
    include_entities: "false",
    tweet_mode: "extended",
    stringify_ids: "true"
  };
  if( this.id ){
    params.user_id = this.id;
    trace( "Twitter, updating user, by id, " + this );
  }else{
    params.screen_name = this.screen_name;
    trace( "Twitter, updating user, by screen_name, " + this );
  }
  
  // Get info about this user
  twit.get( "users/show", params,
    function( err, data, response ){
      if( err ){
        if( err.code === 50 ){
          // TODO: deleted user;
          trace( "TODO: deleted user " + that );
          that.deregister( true /* deleted */ );
          return;
        }
        console.warn( "Twitter, get users/show for " + that + " error", err.code );
        return;
      }
      that.set_twitter_user_data( data );
    }
  );
  
  // Get info about friends of this users
  twit.get( "friends/ids", params,
    
    function( err, data, response ){
      
      if( err ){
        if( err.code === 34 ){
          // ToDo: deleted user
          return;
        }
        if( err.code === 88 ){
          that.time_friends_collected = previous_time_last_update;
          if( !TimeRateExcess ){
            console.warn( "Twitter, rate excess collecting friends" );
          }
          TimeRateExcess = l8.update_now();
           // ToDo: exponential backoff based on usage rate
          // Extract limit from headers
          // Increase or decrease delay depending on available credit
          return reschedule();
        }
        TimeRateExcess = 0;
        console.warn( "Twitter, error when collecting friends", err );
        return;
      }
      
      if( !data ){
        trace( "Missing data in collect_friends()" );
        return reschedule();
      }
      
      // Process list of ids
      trace( 
        "" + data.ids.length,
        "ids received in collect_friends() for user " + that
      );
      TimeRateExcess = 0;
      
      that.set_friends_using_ids( data.ids );
      
    }
  );
  
  // Get info about followers of this users
  twit.get( "followers/ids", params,
    
    function( err, data, response ){
      
      if( err ){
        if( err.code === 34 ){
          // ToDo: deleted user
          return;
        }
        if( err.code === 88 ){
          if( !TimeRateExcess ){
            console.warn( "Twitter, rate excess collecting followers" );
          }
          TimeRateExcess = l8.update_now();
           // ToDo: exponential backoff based on usage rate
          // Extract limit from headers
          // Increase or decrease delay depending on available credit
          return reschedule();
        }
        TimeRateExcess = 0;
        console.warn( "Twitter, error when collecting followers", err );
        return;
      }
      
      if( !data ){
        trace( "Missing data in collect_friends() for followers" );
        return reschedule();
      }
      
      // Process list of ids
      trace( 
        "" + data.ids.length, 
        "followers ids received in collect_friends() for user " + that
      );
      TimeRateExcess = 0;
      
      // Detect added and removed followers
      var old_followers = map();
      var old_followers_count = 0;
      var new_followers = map();
      var new_followers_count = 0;
      
      // Build map of old followers
      var current_followers = that.followers;
      for( var old_follower_id in current_followers ){
        old_followers[ old_follower_id ] = old_follower_id;
        old_followers_count++;
      }
      var added_followers = [];
      var removed_followers = [];

      // For each follower
      var list = data.ids;
      var id;
      var follower_user;
      for( var ii = 0 ; ii < list.length ; ii++ ){
        id = "" + list[ ii ];
        follower_user = AllTwitterUsers[ id ];
        // Skip if not part of the community yet
        if( !follower_user )continue;
        that.add_follower( follower_user );
        new_followers[ id ] = id;
        new_followers_count++;
        // Detect new follower
        if( !old_followers[ id ] ){
          added_followers.push( follower_user );
          // trace( "New friend " + friend_user, "of "+ that );
        }
      }
      
      // Detect removed followers, when possible
      if( list.length < 5000 ){
        var follower;
        for( id in old_followers ){
          if( new_followers[ id ] )continue;
          follower = AllTwitterUsers[ id ];
          removed_followers.push( follower );
          // trace( "Removed follower " + follower, "of " + that );
          if( follower === TwitterUser.get_community() ){
            trace(
              "BUG? Community " + follower,
              "follower of " + that,
              "not a follower anymore ?"
            );
            var community_id = follower.id;
            trace(
              "Community id is", community_id,
              "screen_name:", follower.screen_name
            );
            var found = false;
            for( ii = 0 ; ii < list.length ; ii++ ){
              if( community_id === "" + list[ ii ] ){
                trace( "BUG, community found at index", ii, "on", list.length );
                break;
              }
            }
            if( found )continue;
          }
          that.remove_follower( follower );
        }
      }else{
        // Can't compute it, use known value
        new_followers_count = that.followers_count;
      }
      
      trace( 
        "Done collecting followers of " + that + ".", 
        that.followers_count, "followers,",
        "was " + old_followers_count + ",",
        "became " + new_followers_count + ",",
        added_followers.length, "added,",
        removed_followers.length, "removed"
      );

    }
  );
  
  return true;
  
};


TwitterUser.prototype.set_friends_using_ids = function( ids ){
  
  // Detect added and removed friends
  var old_friends = map();
  var new_friends = map();
  
  // Build map of old friends
  var current_friends = this.friends;
  for( var old_friend_id in current_friends ){
    old_friends[ old_friend_id ] = old_friend_id;
  }
  
  var added_friends = [];
  var removed_friends = [];

  // For each friend
  var list = ids;
  var id;
  var friend_user;
  
  for( var ii = 0 ; ii < list.length ; ii++ ){
  
    id = "" + list[ ii ];
    friend_user = AllTwitterUsers[ id ];
  
    // Unknown? skip or add to the community
    if( !friend_user ){
      if( !this.is_community() )continue;
      friend_user = TwitterUser.register( { id: id } );
    }
    
    this.add_friend( friend_user );
    new_friends[ id ] = id;
    
    // Detect new friends that were not friends before
    if( !old_friends[ id ] ){
      added_friends.push( friend_user );
      // trace( "New friend " + friend_user, "of "+ that );
    }
    
  }
  
  // Process removed friends, those that were there but aren't anymore
  var friend;
  for( id in old_friends ){
    if( new_friends[ id ] )continue;
    friend = AllTwitterUsers[ id ];
    removed_friends.push( friend );
    // trace( "Removed friend " + friend, "of " + that );
    this.remove_friend( friend );
  }
  
  // Check inconsistency, friends
  if( this.twitter_user_data
  &&  this.twitter_user_data.friends_count < this.friends_count 
  ){
    trace( 
      "BUG? inconsistant friends count of " + this,
      "is", this.friends_count,
      "vs twitter's", this.twitter_user_data.friends_count
    );
  }

  // Check inconsistency, followers
  if( this.twitter_user_data
  &&  this.twitter_user_data.followers_count < this.followers_count 
  ){
    trace( 
      "BUG? inconsistant followers count of " + this,
      "is", this.followers_count,
      "vs twitter's", this.twitter_user_data.followers_count
    );
  }
  
  this.time_friends_collected = l8.update_now();
  trace( 
    "Done collecting friends of " + this + ".",
    this.friends_count, "friends,",
    added_friends.length, "added,",
    removed_friends.length, "removed"
  );
  
  return this;

};


var AllStatuses;
var StatusCount = 0;


TwitterUser.get_status = function( id ){
  return AllStatuses[ id ];
};


TwitterUser.prototype.get_status = function( id ){
  var list = this.statuses;
  var len = list.length;
  var status;
  for( var ii = 0 ; ii < len ; ii++ ){
    status = list[ ii ];
    if( status.id_str === id )return status;
  }
  return null;
};


TwitterUser.prototype.get_last_statuses = function( n ){

  var list = this.statuses;
  
  if( !arguments.length )return this.statuses;
  
  // Return n last statuses
  var r = [];
  var len = list.length;
  if( n > len ){
    n = len;
  }
  // Collect n last tweet, lastest first
  for( var ii = 0 ; ii < n ; ii++ ){
    r.push( list[ len - 1 - ii ] );
  }
  return r;
  
};


TwitterUser.prototype.get_last_status = function(){
  var status = this.status;
  var list = this.statuses;
  if( !list.length )return null;
  var last_status = list[ list.length - 1 ];
  de&&mand( status.id === last_status.id );
  return status;
};


TwitterUser.prototype.add_status = function( status ){
  
  if( !status )return;
  var id = status.id_str;
  if( !id )return;
  
  var created_at = status.created_at;
  if( created_at && !status.time_created ){
    var date = new Date( Date.parse( created_at.replace( /( \+)/, ' UTC$1' ) ) );
    var time = date.getTime();
    var age = l8.now - time;
    // Skip too old tweets
    if( age > 3 * 7 * 24 * 3600 * 1000 )return;
    status.time_created = time;
  }
  
  // Patch id to use id_str instead
  status.id = id;
  
  // attache a screen name & user id
  status.screen_name = this.screen_name;
  status.author_id = this.id;
  
  // patch text to use full text
  if( status.full_text ){
    status.text = status.full_text;
  }
  
  // Deal with extended tweets
  if( status.extended_tweet ){
    if( status.extended_tweet.full_text ){
      status.text = status.extended_tweet.full_text;
    }
  }
  
  var list = this.statuses;
  
  var len = list.length;
  var old_status;
  for( var ii = 0 ; ii < len ; ii++ ){
    old_status = list[ ii ];
    if( old_status.id === id ){
      // Update if new data
      if( status.time_created > old_status.time_created
      ||  status.text !== old_status.text // deal with extended tweets
      ){
        list[ ii ] = status;
        AllStatuses[ id ] = status;
        if( !this.status ){
          this.status = status;
        }else if( this.status.id === status.id ){
          this.status = status;
        }
      }
      return;
    }
  }
  
  // When never seen before status, add it to list of statuses
  AllStatuses[ id ] = status;
  StatusCount++;
  list.push( status );
  
  // Update last status
  if( !this.status || this.status.time_created < status.time_created ){
    this.status = status;
  }
  
  if( Kudo.TrustTweet ){
    Kudo.TrustTweet.add( status );
  }

  // Remove too old statuses, 3 weeks, but keep 10 last ones
  var limit = l8.now - 3 * 7 * 24 * 3600 * 1000;
  len = list.length;
  if( len >= 10
  ||  len > 0 && list[ 0 ].time_created < limit
  ){
    var nremoved = 0;
    for( ii = 0 ; ii < len ; ii++ ){
      if( ( len - nremoved ) <= 10 )break;
      old_status = list[ ii ];
      if( old_status.time_created > limit )break;
      delete AllStatuses[ old_status.id ];
      StatusCount--;
      if( Kudo.TrustTweet ){
        Kudo.TrustTweet.remove( old_status );
      }
      nremoved++;
      if( this.status.id === old_status.id ){
        this.status = null;
      }
    }
    if( nremoved ){
      list.slice( nremoved );
      if( list.length ){
        this.status = list[ list.length - 1 ];
      }else{
        this.status = null;
      }
    }
  }
  
  return this;
  
};


/* ---------------------------------------------------------------------------
 *  disk based cache management
 */


var SaveScheduled = false;
var TimeLastSaved = 0;
var TimeLastWrite = 0;
var LastSavedJson = "";
var LastSavedData = null;
var CacheFileIsValid = false;

TwitterUser.get_time_last_change = function(){
  return TimeLastSaved;
};


TwitterUser.save = function(){
// Data are saved in some disk based cache to respect Twitter rate limits

  // Auto schedule, save at most once per minute
  if( SaveScheduled )return;
  SaveScheduled = true;
  setTimeout(
    function(){
      SaveScheduled = false;
      TwitterUser.save();
    }, 
    60 * 1000
  );
  
  var now = l8.update_now();
  var age = now - TimeLastSaved;
  var period = 60 * 1000;
  if( age < period )return;

  if( BacklogSize ){
    trace( 
      "", BacklogSize, "users monitored.",
      UpdatedFriendsCount, "updated friends.",
      Math.round( ( now - TimeLastWrite ) / 60000 ), "min. since disk write"
    );
  }

  if( TimeRateExcess ){
    var duration = now - TimeRateExcess;
    trace( 
      "Twitter rate excess since", duration, "ms,",
      Math.round( duration / 60000 ), "min"
    );
  }

  var community = TwitterUser.get_community();
  var changed = false;
  var users = [];
  var users_count = 0;
  var friendships_count = 0;
  var followers_count = 0;

  for( var user_idx in AllTwitterUsers ){
    
    var user = AllTwitterUsers[ user_idx ];
    
    // Cleanup deleted users
    if( user.deregistered ){
      user.deregister();
      continue;
    }
    
    // Idem from members that don't belong to the community anymore
    if( !user.is_member && user !== community ){
      if( user.deregister() )continue;
    }
    
    users_count++;
    
    var user_data = {
      id: user.id,
      screen_name: user.screen_name,
      deregistered: user.deregistered,
      time_touched: user.time_touched,
      time_last_changed: user.time_last_changed,
      time_friends_collected: user.time_friends_collected,
      time_twitter_user_data: user.time_twitter_user_data,
      statuses: user.statuses,
      friends: [],
      followers: []
    };
    
    // Cache some data from the twitter user profile
    var src = user.twitter_user_data;
    if( src ){
      user_data.twitter_user_data = { 
        name:              src.name,
        url:               src.url,
        profile_image_url: src.profile_image_url,
        followers_count:   src.followers_count
      };
    }
    
    if( false && !changed && LastSavedData ){
      var old = LastSavedData.users[ users_count - 1 ];
      if( !old ){
        changed = true;
        trace( "New user, changed,", users_count - 1 );
      }else if( old.id !== user.id ){
        changed = true;
        trace( "ID changed" );
      }else if( old.screen_name !== user.screen_name ){
        changed = true;
        trace( "screen_named changed" );
      }else if( old.time_touched !== user.time_touched ){
        changed = true;
        trace( "time_touched changed" );
      }else if( old.time_last_changed !== user.time_last_changed ){
        changed = true;
        trace( "time_last_changed changed" );
      }else if( old.time_friends_collected !== user.time_friends_collected ){
        changed = true;
        trace( "time_friends_collected changed" );
      }else if( user.screen_name !== "jhr" 
      &&    JSON.stringify( old.twitter_user_data )
        !== JSON.stringify( user_data.twitter_user_data )
      ){
        changed = true;
        trace( "twitter_user_data changed" );
      }else if( old.time_twitter_user_data !== user.time_twitter_user_data ){
        changed = true;
        trace( "time_twitter_user_data changed" );
      }
      if( changed ){
        trace( "First detected change is about user " + user );
      }
    }

    if( false ){ // Old debug code to track circular reference on "jhr" user
    try{ 
      JSON.stringify( user_data );
    }catch( err ){
      trace( "BUG? not json data for " + user.id + "/" + user.screen_name );
      var ok = false;
      try{ 
        JSON.stringify( user_data.twitter_user_data );
        ok = true;
      }catch( err ){
        trace( "BUG? not json twitter data, idx", user_idx );
        user_data.twitter_user_data = null;
        // ToDo: figure out where the bug comes from
        ok = true;
      }
      if( !ok )continue;
    }
    }

    if( !user.cached_friend_ids ){
      user.cached_friend_ids = Object.keys( user.friends );
    }
    user_data.friends = user.cached_friend_ids;
    friendships_count += user.friends_count;
    if( user_data.friends.length !== user.friends_count ){
      trace( "Bad saved friends list" );
    }
    if( false ){
    if( !user.cached_follower_ids ){
      user.cached_follower_ids = Object.keys( user.followers );
    }
    user_data.followers = user.cached_follower_ids;
    }
    followers_count += user.followers_count;
    
    users.push( user_data );

  }
  
  if( friendships_count !== followers_count ){
    trace(
      "BUG, friends", friendships_count,
      "isn't followers", followers_count
    );
  }

  if( LastSavedData ){
    if( users_count !== LastSavedData.users.length ){
      trace( 
        "Number of users changed, was", LastSavedData.users.length,
        "and is now", users_count
      );
    }
  }
  
  var new_image = {
    meta: { time_saved: now }, 
    users: users,
    friends: Kudo.TrustFriend.get_bulk()
  };
  
  LastSavedData = new_image;
  FriendshipsCount = friendships_count;
  
  var now2 = l8.update_now();
  trace(
    "Twitter, save in", now2 - now, "ms,",
     users_count, "users including",
     UpdatedFriendsCount, "updated ones,",
     StatusCount, "statuses",
     friendships_count, "friendships",
     followers_count, "followers"
  );
  
  // Finish job later, it's too long already
  setTimeout( function(){
  
  var json = JSON.stringify( new_image );
  TimeLastSaved = l8.now;
  
  if( false ){
  LastSavedJson = json;
  if( ( now - TimeLastWrite ) > 3600 * 1000 // at least once per hour
  ||  !LastSavedJson
  ||    json.substring( json.indexOf( '"users":' ) ) 
    !== LastSavedJson.substring( LastSavedJson.indexOf( '"users":' ) )
  ){
    
    if( LastSavedJson ){
      for( var ii = json.indexOf( '"users":' ) ; ii < json.length ; ii++ ){
        if(   json.substring( ii, ii + 1 ) 
          !== LastSavedJson.substring( ii, ii + 1 )
        ){
          var start = ii - 30;
          if( start < 0 ){
            start = 0;
          }
          trace( "JSON diff:", 
            "\n" + json.substring( start, start + 79 ),
            "\n" + LastSavedJson.substring( start, start + 79 )
          );
          break;
        }
      }
    }
  }
  }
    
  if( CacheFileIsValid ){
    // TODO: it bombs and leaves an unfinished file
    fs.writeFile( 
      "twitter_users.json.new", 
      json,
      "utf8",
      function( err ){
        if( err ){
          console.warn( "SOMETHING BAD with file twitter_users.json" );
        }else{
          // Rename only when writing is a full success
          try{
            fs.rename( "twitter_users.json.new", "twitter_users.json" );
            // Reschedule
            TwitterUser.save();
          }catch( ren_err ){
            console.warn( "COULD NOT RENAME twitter_users.json.new" );
          }
        }
        var now3 = l8.update_now();
        trace( "Twitter, async save in", now3 - now2, "ms" );
        TimeLastWrite = l8.update_now();
      }
    );
  }else{
    TimeLastWrite = l8.update_now();
    console.warn( "SOMETHING BAD with file twitter_users.json" );
  }
  
  }, 1000 );
  
}; // save()



TwitterUser.load = function(){
// Called at startup to restart using data from disk cache
  
  var now = l8.update_now();
  
  var text = "";
  try{
    text = fs.readFileSync( "twitter_users.json", "utf8" );
  }catch( err ){
    console.warn( "Could not read file 'twitter_users.json'" );
    return;
  }
  var data = "";
  try{
    data = JSON.parse( text );
  }catch( err ){
    console.warn( "Invalid content for 'twitter_users.json" );
    trace( err );
    console.warn( "NO SAVE, NO SAVE, NO SAVE" );
    return;
  }
  
  // Save a backup
  try{
    fs.writeFileSync( "twitter_users.json.bak", text, "utf8" );
  }catch( err ){
    console.warn( "Could not save twitter_users.json.bak" );
  }

  // JSON data includes an array of users
  var meta = data.meta;
  var users = data.users;
  var friends = data.friends;
  if( !meta ){
    users = data;
  }
  
  if( users.length < 1000 ){
    console.warn( "Twitter cache file, invalid user count is", users.length );
    console.warn( "NO SAVE, NO SAVE, NO SAVE" );
    // return;
  }
  
  // Don't use twitter API while loading
  TimeFriendCollectorBusy = now;
  
  var user_data;
  var user;
  var friendships_count = 0;
  var followships_count = 0;
  var statuses_count = 0;
  
  // First, create all users
  for( var ii = 0 ; ii < users.length ; ii++ ){
    user_data = users[ ii ];
    // trace( "Loading " + user_data.id, " user " + user_data.screen_name );
    user = TwitterUser.register( { 
      id: user_data.id, 
      screen_name: user_data.screen_name
    } );
  }
  
  function uptodate( user ){
    var age_collected = now - user.time_friends_collected;
    return age_collected < 3 * 24 * 3600 * 1000;
  }
  
  // Then populate friendships and other data
  for( ii = 0 ; ii < users.length ; ii++ ){
    
    user_data = users[ ii ];
    
    user = TwitterUser.find_by_id( user_data.id );
    
    if( user.twitter_user_data && user.twitter_user_data.name ){
      user.set_twitter_user_data(
        user_data.twitter_user_data,
        user_data.time_twitter_user_data
      );
    }
    
    user.deregistered = user_data.deregistered;
    user.time_touched = user_data.time_touched;
    user.time_last_changed = user_data.time_last_changed;
    user.time_friends_collected = user_data.time_friends_collected;
    
    if( uptodate( user ) ){
      if( !UpdatedFriends[ user.id ] ){
        UpdatedFriends[ user.id ] = user;
        UpdatedFriendsCount++;
      }
    }
    
    user_data.friends.forEach( function( friend_id ){
      if( !friend_id ){
        // trace( "BUG, bad friend_id in load()" );
        return;
      }
      if( friend_id.length < 7 ){
        trace( "BUG, bad id in load()", friend_id );
        debugger;
        return;
      }
      user.add_friend( TwitterUser.register( { id: friend_id } ) );
      friendships_count++;
    } );
    
    if( user_data.followers ){
    user_data.followers.forEach( function( follower_id ){
      if( !follower_id ){
        nde&&bug( "BUG, bad follower_id in load()" );
        debugger;
        return;
      }
      TwitterUser.register( { id: follower_id } ).add_friend( user );
      followships_count++;
    } );  
    }
    
    if( friendships_count !== followships_count ){
      nde&&bug( 
        "BUG, followships not equal to friendships,", 
        followships_count, "vs", friendships_count
      );
    }
    
    if( user_data.statuses ){
      user_data.statuses.forEach( function( idx ){
        statuses_count++;
        user.add_status( user_data.statuses[ idx ] );
      } );
    }
    
  }
  
  trace( 
    "File 'twitter_users.json', time to load:", l8.update_now() - now,
    "ms for", users.length, "users with", friendships_count, "friendships",
    "and", UpdatedFriendsCount, "updated users",
    "including", statuses_count, "statuses"
  );
  
  if( false && friendships_count !== followships_count ){
    nde&&bug( 
      "BUG, load(), total followships not equal to friendships,",
      followships_count, "vs", friendships_count
    );
  }
  
  // Top external friends data
  Kudo.TrustFriend.set_bulk( friends );
  
  // Set flag to enable cache file overwrite
  CacheFileIsValid = true;
  
}; // load()


/* ---------------------------------------------------------------------------
 *  MonitoredPersona class
 */

// npm install twit - https://github.com/ttezel/twit
var Twit = require( "twit" );

var AllPersonas = [];
var AllMonitoredPersonas = [];
var AllMonitoredPersonasById;
var CommunityUser = null;


function MonitoredPersona( persona, domain ){

  this.persona = persona;
  this.domain_name = this.screen_name = persona.id.substring( 1 );
  this.domain  = domain;
  this.machine = null;
  this.twit    = new Twit({
    consumer_key:         domain.twitter_consumer_key,
    consumer_secret:      domain.twitter_consumer_secret,
    access_token:         domain.twitter_access_token,
    access_token_secret:  domain.twitter_access_token_secret
  });

  AllPersonas.push( persona );
  AllMonitoredPersonas.push( this );
  AllMonitoredPersonasById[ persona.id ] = this;
  
  this.twitter_user = TwitterUser.register(
    { 
      screen_name: persona.id.substring( 1 ),
      // ToDo: this is hardcoded for user @suvranu
      id: "876928762985803776"
    },
    persona
  );
  
  CommunityUser = this.twitter_user;

  this.stream = null;
  // Is this the "main" domain?
  var config = Ui1Server.get_config();
  var config_domain = config.domain;
  if( config_domain.toLowerCase() === persona.id.substring( 1 ) ){
    trace( "Twitter, start monitoring main domain", persona.label );
    this.domain_name = "";
    this.machine = Ephemeral.Machine.main;
    this.open_user_stream();
    return;
  }

  // Need to start a new machine, from main machine
  trace( "Twitter, start Ephemeral machine for domain", persona.label );
  // Ephemeral.Machine.main.activate();
  this.machine = new Ephemeral.Machine( { owner: this.domain_name } );
  this.machine.activate();
  // When machine init is done, some more work remains
  var that = this;
  Ephemeral.start( null /* bootstrap() */, function( err ){
    if( err ){
      trace( "ERR, could not start Ephemeral machine", persona.id );
      return;
    }
    trace( "Twitter, start monitoring domain", persona.label );
    TwitterUser.load();
    that.open_user_stream();
  });
  // Ephemeral.Machine.main.activate();
  
}


MonitoredPersona.current = null;

var MonitoredPersonaProto = MonitoredPersona.prototype;


MonitoredPersonaProto.toString = function(){
  return "Twit/" + this.persona.id;
};


var event_names = [
  "tweet",
  "delete",
  "limit",
  "scrub_geo",
  "disconnect",
  "connect",
  "reconnect",
  "warning",
  "status_withheld",
  "user_withheld",
  "friends",
  "direct_message",
  "user_event",
  "blocked",
  "unblocked",
  "favorite",
  "unfavorite",
  "follow",
  "unfollow",
  "user_update",
  "list_created",
  "list_destroyed",
  "list_updated",
  "list_member_added",
  "list_member_removed",
  "list_user_subscribed",
  "list_user_unsubscribed",
  "unknown_user_event"
];


// Define a "default" handler for each event type

var LastEvent = null;
var LastEventMonitoredPersona = null;

event_names.forEach( function( event_name ){
  MonitoredPersonaProto[ event_name ] = function( event ){
    LastEvent = event;
    LastEventMonitoredPersona = this;
    MonitoredPersona.current = this;
    var fn = MonitoredPersonaProto[ "process_" + event_name ];
    if( fn ){
      // trace( 'Twitter event "' + event_name + '" about ' + this );
      try{
        fn.call( this, event );
      }catch( err ){
        trace(
          "Twitter event err for", event_name,
          "about " + this,
          err, err.stack
        );
      }
    }else{
      trace( 'Twitter unmanaged event "' + event_name + '" about ' + this );
    }
  };
});


MonitoredPersonaProto.open_user_stream = function(){
  var stream = this.stream 
  = this.twit.stream( "user", {
    with: "followings",
    stall_warning: "true",
    stringify_ids: "true",
    stringify_friend_ids: "true",
    track: "kudocracy" // from the public stream, ie not within followings
  } );
  var that = this;
  event_names.forEach( function( event_name ){
    stream.on( event_name, MonitoredPersonaProto[ event_name ].bind( that ) );
  });
  console.log( "Listen to Twitter CLI events for domain " + this.domain_name );
  return this;
};


MonitoredPersonaProto.process_friends = function( event ){
// Get list of friend ids. This is first called for the user stream "preambule"
  var friends = event.kudocracy_friends || event.friends || event.friends_str;
  var that = this;
  var start = event.lookup_start || 0;
  // First look for a "kudocracy" list, when none, all friends are voters
  if( start === 0 ){
    if( false && !this.kudocracy_list_queried ){
      this.friends = friends;
      this.kudocracy_list_queried = true;
      this.twit.get(
        "lists/members",
        {
          owner_screen_name: this.screen_name,
          slug: "Kudocracy",
          include_entities: "false",
          // skip_status: "true",
          count: 5000, // Max supported by twitter,
          tweet_mode: "extended",
          stringify_ids: "true"
        },
        MonitoredPersonaProto.process_kudocracy_list_members_response.bind( that, event )
      );
      // Postpone collecting friends while collecting community members
      TimeFriendCollectorBusy = l8.update_now();
      return;
    }
  }
  if( start >= friends.length ){
    trace( 
      "Twitter friends of monitored user " + this + " processed, "
      + friends.length
    );
    CommunityUser.set_friends_using_ids( friends );
    setTimeout( TwitterUser.save, 60 * 1000 );
    return;
  }
  var friends_slice = friends.slice( start, start + 100 );
  that = this;
  nde&&bug( "Twitter friends to process:", start, "until", friends.length );
  friends_slice.forEach( function( id ){
    TwitterUser.register( { id_str: "" + id } );
  } );
  // Get info on next 100 friends (twitter limit, 100 friends per request)
  event.lookup_start = start + 100;
  nde&&bug( "Twitter, send users/lookup request about " + this );
  var params = { 
    user_id: friends_slice, 
    include_entities: false,
    tweet_mode: "extended",
    stringify_ids: "true"
  };
  this.twit.get(
    "users/lookup", params,
    MonitoredPersonaProto.process_users_lookup_response.bind( that, event )
  );
  // Postpone collecting friends while collecting community members
  TimeFriendCollectorBusy = l8.update_now();
  
};


MonitoredPersonaProto.process_kudocracy_list_members_response
= function( friends_event, err, data, response ){
  var users = [];
  if( err ){
    if( err.code !== 34 )return this.process_error_response( err );
    users = this.friends;
    // When there are more than 3000 friends, a "kudocracy" list is mandatory
    if( users.length > 3000 ){
      trace(
        "Twitter, domain " + this + " has", users.length, "friends",
        'but no "Kudocracy" list, nobody can vote'
      );
      users = [];
    }
  }else{
    users = data.users;
  }
  if( !users ){
    trace( "BUG? Twitter lists/members missing 'users' in response" );
    users = [];
  }
  friends_event.kudocracy_friends = this.kudocracy_friends = users;
  this.process_friends( friends_event );
};


MonitoredPersonaProto.process_error_response = function( err ){
  // trace( "Twitter response received about " + this );
  if( err ){
    trace( "Twitter response error on " + this, "error:", err );
    debugger;
    return true;
  }
  return false;
};


MonitoredPersonaProto.process_users_lookup_response
= function( event, err, data, response ){

  if( this.process_error_response( err, data, response ) )return;
  var that = this;
  that.machine.activate();

  data.forEach( function( user ){
    
    // Is there a matching Persona
    // ToDo: should look at main engine machine in addition to domain level one
    var persona = Persona.find( "@" + user.screen_name );
    if( !persona ){
      // This friend is not know yet
      nde&&bug( "Twitter unknown friend", user.screen_name );
      TwitterUser.register( user );
      
    }else{
      // This friend is known, attach twitter user info to the persona
      trace(
        "Twitter user", user.screen_name, "found for " + persona,
        "friend of " + that.persona
      );
      var twitter_user = TwitterUser.register( user, persona );
      user.kudo_persona = persona;
      if( that.machine === Ephemeral.MainMachine ){
        twitter_user.persona = persona;
      }
    }
  });
  
  // Ephemeral.Machine.main.activate();
  
  // Process next 100 friends
  this.process_friends( event );

};


MonitoredPersonaProto.process_tweet = function( event ){
  
  var text = event.text;
  var idx;
  
  // If retweet, ignore RT @xxxx : prefix
  if( text[0] === "R" && text[1] === "T" ){
    idx = text.indexOf( ": " );
    if( idx === -1 )return;
    text = text.substring( idx + 2 );
  }
  
  // Ignore first @xxxxx mentions, but detect @kudocracy
  var kudocracy_mentionned = false;
  text = text.replace( /^(@[^ ]+ )+/, function( m ){
    if( m.toLowerCase().indexOf( "@kudocracy" ) !== -1 ){
      kudocracy_mentionned = true;
    }
    return "";
  } );
  
  // Look for either "kudo " or "kudocracy " or "@kudocracy" signal
  var for_cli = true;
  if( text.substring( 0, "kudo ".length ) === "kudo " ){
    text = text.substring( "kudo ".length );
  }else if( text.substring( 0, "kudocracy ".length ) === "kudocracy " ){
    text = text.substring( "kudocracy ".length );
  }else{
    for_cli = kudocracy_mentionned;
  }
  
  // Check that tweet comes from a know user
  var from = event.user.screen_name;
  var twitter_user = TwitterUser.find( from );
  if( !twitter_user ){
    // If tweet from half baked user, user known by id only so far
    twitter_user = TwitterUser.find_by_id( event.user.id_str );
    if( twitter_user ){
      twitter_user = TwitterUser.register( event.user );
    }else{
      twitter_user = TwitterUser.register( event.user );
      trace(
        "twitter tweet from new user:",
        from, "text:",
        event.text
      );
    }
  }else{
    // Update twitter_user_data
    TwitterUser.register( event.user );
  }
  if( twitter_user ){
    // This is a friend of the community
    TwitterUser.find( this.screen_name ).add_friend( twitter_user );
  }
  
  if( !for_cli ){
    nde&&bug( "Twitter, tweet from " + twitter_user, "text:", event.text );
    twitter_user.add_status( event );
    return;
  }
  
  cli( event, twitter_user, text );

};


MonitoredPersonaProto.process_direct_message = function( event ){
  var for_cli = true;
  var msg = event.direct_message;
  var to = msg.recipient_screen_name;
  // Ignore direct messages between users, only catch those for me
  if( to.toLowerCase() !== MonitoredPersona.current.screen_name ){
    trace(
      "Twitter, ignore direct message to:", to, 
      "domain:", MonitoredPersona.current.screen_name
    );
    for_cli = false;
  }
  // debugger;
  var from = msg.sender_screen_name;
  var text = msg.text;
  if( for_cli ){
    if( text.substring( 0, "kudo ".length ) === "kudo " ){
      text = text.substring( "kudo ".length );
      for_cli = true;
    }else if( text.substring( 0, "kudocracy ".length ) === "kudocracy " ){
      text = text.substring( "kudocracy ".length );
      for_cli = true;
    }else{
      for_cli = false;
    }
  }
  var twitter_user = TwitterUser.find( from );
  if( !twitter_user ){
    trace(
      "BUG? twitter direct message from unknown (new?) user ", from, "to", to,
      "msg:", msg.text
    );
    return;
  }
  if( !for_cli ){
    trace( 
      "Twitter, ignored direct message from " + twitter_user, "to", to,
      "msg:", msg.text
    );
    return;
  }
  cli( event, twitter_user, text );
  
};


MonitoredPersonaProto.process_delete = function( event ){
  var delete_data = event.delete;
  if( !delete_data ){
    trace( "Missing twitter 'delete' data for" + this );
    return;
  }
  var status = delete_data.status;
  if( status ){
    // ToDo: process deleted status
    return;
  }
  trace( "TODO, delete on " + this );
  debugger;
};


MonitoredPersonaProto.send_direct_message = function( to, text ){
  trace( "Twitter, send direct message to", to, "text:", text );
  this.twit.post( "direct_messages/new", {
    screen_name: to.screen_name || to,
    text: text.substring( 0, 280 )
  }, MonitoredPersonaProto.process_response.bind( this ) );
};




/* ---------------------------------------------------------------------------
 *  Twitter based CLI to Kudocracy
 */

var synonyms = {

  "+":    "agree",
  "+1":   "agree",
  "-":    "disagree",
  "-1":   "disagree",
  "==":   "neutral",
  "?!":   "blank",
  "!?":   "blank",
  "??":   "blank",
  "???":  "blank",
  "!":    "protest",
  "!!":   "protest",
  "!!!":  "protest",

  "kudo":        "agree",
  "kudos":       "agree",
  "yes":         "agree",
  "up":          "agree",
  "praise":      "agree",
  "agreed":      "agree",
  "endorse":     "agree",
  "approve":     "agree",
  "support":     "agree",
  "defend":      "agree",
  "save":        "agree",
  "secure":      "agree",
  "sustain":     "agree",
  "foster":      "agree",
  "maintain":    "agree",
  "join":        "agree",
  "participate": "agree",
  "accept":      "agree",
  "allow":       "agree",
  "yea":         "agree",
  "yay":         "agree",
  "for":         "agree",
  "yeah":        "agree",
  "like":        "agree",
  "ok":          "agree",
  "oui":         "agree", // fr
  "pour":        "agree",
  "aime":        "agree",
  "j'aime":      "agree",
  "j'approuve":  "agree",
  "d'accord":    "agree",
  "si":          "agree", // it, spanish
  "sic":         "agree", // latin
  "sim":         "agree", // Portuguese
  "da":          "agree", // east
  "ie":          "agree", // corsican
  "jes":         "agree", // esperanto
  "hai":         "agree", // japan
  "ja":          "agree", // netherland
  "tak":         "agree", // polish
  "ano":         "agree", // tchek
  "evet":        "agree", // turk
  
  "no":         "disagree",
  "ko":         "disagree",
  "nay":        "disagree",
  "nah":        "disagree",
  "boo":        "disagree",
  "down":       "disagree",
  "disagreed":  "disagree",
  "disapprove": "disagree",
  "disclaim":   "disagree",
  "dissent":    "disagree",
  "differ":     "disagree",
  "object":     "disagree",
  "prevent":    "disagree",
  "disallow":   "disagree",
  "discard":    "disagree",
  "rebuff":     "disagree",
  "veto":       "disagree",
  "withold":    "disagree",
  "refuse":     "disagree",
  "bar":        "disagree",
  "against":    "disagree",
  "fight":      "disagree",
  "beat":       "disagree",
  "defeat":     "disagree",
  "resist":     "disagree",
  "reject":     "disagree",
  "remove":     "disagree",
  "combat":     "disagree",
  "neutralize": "disagree",
  "cancel":     "disagree",
  "oppose":     "disagree",
  "hinder":     "disagree",
  "mock":       "disagree",
  "repel":      "disagree",
  "refute":     "disagree",
  "don't":      "disagree",
  "not":        "disagree",
  "non":        "disagree",
  "contre":     "disagree",
  "pas":        "disagree", // fr, pas d'accord
  "nein":       "disagree", // german
  "ne":         "disagree", // esperanto
  "nej":        "disagree", // danish
  "nei":        "disagree", // icelandic
  "iie":        "disagree", // japan
  "nee":        "disagree",
  
  "wtf":     "blank",
  "blanc":   "blank",
  "nota":    "blank",
  "blanco":  "blank",
  "branco":  "blank",
  
  "abstain":  "neutral",
  "hesitate": "neutral",
  "pass":     "neutral",
  "skip":     "neutral",
  "j'hesite": "neutral",
  "neutre":   "neutral",
  
  
  "abuse": "protest",
  "abus":  "protest",
  "block": "protest",
  
  "eol": "eol"
};


var verbs = {
  
  "help":  cli_help,
  "info":  cli_help,
  "aide":  cli_help,
  
  "vote":  cli_vote,
  "voter": cli_vote,
  "votez": cli_vote,
  
  "delegate": cli_delegate,
  "via":      cli_delegate,
  "delegue":  cli_delegate,
  "deleguer": cli_delegate,
  "deleguez": cli_delegate,
  
  "login": cli_login
  
};


var AntiLoopLastMessage = "";

function cli( event, user, text ){
  
  var from = user.screen_name;
  var to   = MonitoredPersona.current.screen_name;
  
  // Avoid handling responses, they all include a link and the #kudocracy hash
  if( text.indexOf( "#kudocracy" ) !== -1 && text.indexOf( "http" ) !== -1 ){
    // The message is actually a response sent to a previous command
    trace( "Twitter, ignore reponse " + text );
    return;
  }
  
  if( text === AntiLoopLastMessage ){
    trace(
      "BUG? Twitter CLI loop?",
      "to:", to,
      "from:", from,
      "text:", text
    );
    return;
  }
  AntiLoopLastMessage = text;

  var raw_text
  = text
  .replace( /[^A-Za-z0-9_@#!?/'\-\.]/g, " " )
  .replace( /  /g, " " ).trim();
  trace(
    "Twitter KUDO message",
    "to:", to, 
    "from:", from,
    "text:", raw_text
  );
  
  var tokens = raw_text.split( " " );
  if( !tokens.length )return;
  
  // Handle some synonyms, look for orientation
  var parsed_tokens = [];
  var agree_found    = false;
  var disagree_found = false;
  var protest_found  = false;
  var blank_found    = false;
  var neutral_found  = false;
  var mention = null;
  var hashtag = null;
  var hashtags = [];
  tokens.every( function( t ){
    if( t === "--" || t === "---" )return false;
    var syn = synonyms[ t.toLowerCase() ];
    if( !syn ){
      if( t[0] === "@" ){
        if( !mention ){
          mention = t;
          return true;
        }
      }else if( t[0] === "#" ){
        hashtags.push( t );
        if( !hashtag ){
          hashtag = t;
          return true;
        }
      }
      parsed_tokens.push( t );
      return true;
    }
    if( syn === "agree" ){
      agree_found = true;
    }else if( syn === "disagree" ){
      disagree_found = true;
    }else if( syn === "protest" ){
      protest_found = true;
    }else if( syn === "neutral" ){
      neutral_found = true;
    }else if( syn === "blank" ){
      blank_found = true;
    }else{
      parsed_tokens.push( syn );
    }
    return true;
  });
  
  var orientation = null;
  if( neutral_found ){
    orientation = "neutral";
  }
  if( blank_found ){
    orientation = "blank";
  }
  if( agree_found ){
    orientation = "agree";
  }
  if( disagree_found ){
    orientation = "disagree";
  }
  if( protest_found ){
    orientation = "protest";
  }
  
  var verb = verbs[ parsed_tokens[ 0 ] ];
  if( !verb ){
    if( mention && hashtag ){
      verb = cli_delegate;
    }else if( hashtag ){
      verb = cli_vote;
      orientation = orientation || "agree";
    }else if( mention ){
      verb = cli_vote;
      orientation = orientation || "agree";
      hashtag = "#" + mention.substring( 1 );
    }
  }else{
    parsed_tokens = parsed_tokens.slice( 1 );
  }
  
  // Silently ignore if not parseable
  if( !verb )return;
  
  return verb({
    event:         event,
    user:          user,
    parsed_tokens: parsed_tokens,
    orientation:   orientation,
    hashtag:       hashtag,
    hashtags:      hashtags,
    mention:       mention,
    text:          text,
    raw_text:      raw_text
  });
    
}

function send( to, text, url ){
  var sender = MonitoredPersona.current;
  var domain = "";
  if( !url ){
    url = text || "";
  }
  if( sender.domain_name ){
    if( url.indexOf( "?" ) !== -1 ){
      url = url.replace( "?", "?kudo=" + sender.domain_name + "&" );
    }else{
      domain = "?kudo=" + sender.domain_name;
    }
  }
  sender.send_direct_message( to,
    text 
    + " @" + sender.screen_name
    + " http://" + ui.get_config().host + "/" + url + domain
  );
}


function send_kudo( data, text, url ){
  send(
    data.user.screen_name,
    "kudo " + text + " -- #kudocracy", url || text
  );
}


function cli_help( data ){
  trace( "Twitter cli, help request by " + data.user );
  send_kudo( data, "help" );
}


function cli_login( data ){
  trace( "Twitter cli, login request by " + data.user );
  var secret = "" + Math.round( Math.random() * 100000 );
  Ui1Server.set_login_secret( secret + data.user.screen_name );
  send_kudo(
    data, "login", "login/" + data.user.screen_name + "?secret=" + secret
  );
}


function cli_vote( data ){
  if( !data.hashtag ){
    if( !data.mention ){
      return;
    }
    data.hashtag = "#" + data.mention.substring( 1 ); // # instead of @
  }
  if( !data.orientation ){
    data.orientation = "agree";
  }
  trace(
    "Twitter cli, vote by " + data.user,
    "on " + data.hashtag, data.orientation
  );
  MonitoredPersona.current.machine.activate();
  var persona = Persona.find( "@" + data.user.screen_name );
  if( !persona ){
    // ToDo: if domain is public, should create the persona
    if( !MonitoredPersona.current.domain.is_public ){
      trace(
        "Twitter vote attempt by new persona", data.user.screen_name,
        "in domain", MonitoredPersona.current.screen_name
      );
      return;
    }
    persona = "@" + data.user.screen_name;
    Ephemeral.inject( "Persona", { label: persona } );
  }
  var proposition = Topic.find( data.hashtag.substring( 1 ) );
  if( !proposition ){
    proposition = Topic.find( data.hashtag );
  }
  if( !proposition ){
    trace(
      "BUG? twitter vote on unknown proposition", data.hashtag,
      "by", persona.label || persona,
      "in domain", MonitoredPersona.current.screen_name
    );
    return;
  }
  trace(
    "Twitter vote on " + proposition,
    "by", persona.label || persona,
    "in domain", MonitoredPersona.current.screen_name,
    "orientation:", data.orientation
  );
  Ephemeral.inject( "Vote", {
    proposition: proposition,
    orientation: data.orientation,
    persona: persona
  });
  // Send confirmation direct message
  send_kudo(
    data,
    "vote " + data.orientation + " " + data.hashtag,
    "proposition/" + encodeURIComponent( proposition.label )
  );
  
}


function cli_delegate( data ){
  trace(
    "Twitter cli, delegation by " + data.user,
    "to " + data.mention,
    "about" + data.hashtags.join( "+" )
  );
}


/* ---------------------------------------------------------------------------
 *  Start monitoring. Main entry point.  Called from ui1.js at startup.
 */

exports.start = function( ui1_server ){
    
  // Import stuff from main.js, shared with ui1_server defined in ui1core.js
  Ui1Server = ui1_server;
  process_kudo_imports( ui1_server.get_kudo_scope() );
  
  AllTwitterUsers = map();
  TwitterUsersByScreenName = map();
  UpdatedFriends = map();
  AllMonitoredPersonasById = map();
  AllStatuses = map();

  console.log( "Ready to listen for Twitter CLI events" );
  
  // Collect initial list of personas to monitor, one per "domain"
  Ephemeral.each( Persona.all, function( persona ){
    if( !persona.is_domain ){
      trace( "BUG? persona is not a Persona, .is_domain() is missing" );
      trace( persona.id );
      if( persona.toString ){
        trace( persona.toString() );
      }
      debugger;
      return;
    }
    if( !persona.is_domain() )return;
    var persona_topic = persona.get_topic();
    if( !persona_topic ){
      console.warn( "Twitter, missing persona topic for " + persona );
      return;
    };
    var domain = persona_topic.get_data( "domain" );
    if( !domain ){
      console.warn( "Twitter, no 'domain' data for domain " + persona );
      return;
    }
    if( !domain.twitter_consumer_key ){
      console.warn( "Twitter, no consumer key for domain " + persona );
      return;
    };
    trace( "Twitter, new monitored persona " + persona );
    new MonitoredPersona( persona, domain );
  });
  
  // Export
  Ui1Server.ui1twit( MonitoredPersona, TwitterUser );
  
};
