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
var TwitterFriendsByScreenName;
var TwitterUserCount = 0;

function TwitterUser( twitter_user_data, persona ){
  var now = l8.update_now();
  var screen_name = twitter_user_data.screen_name;
  if( screen_name === "suvranu" ){
    trace( "Domain", screen_name, "registration" );
  }
  var id = twitter_user_data.id_str || twitter_user_data.id;
  if( false && id && id.length < 8 ){
    trace( "Unusual twitter short id", id, "for", screen_name );
  }
  var user;
  if( screen_name ){
    if( screen_name === "u_sgio" ){
      trace( "Twitter, u_sgio found" );
      debugger;
    }
    if( screen_name === "AjaccioRose" ){
      trace( "Twitter, AjaccioRose found" );
      debugger;
    }
    if( screen_name === "pancaraccia" ){
      trace( "Twitter, pancaraccia found" );
      debugger;
    }
    if( screen_name === "BartoliDume" ){
      trace( "Twitter, BartoliDume found" );
      debugger;
    }
    user = TwitterUsersByScreenName[ screen_name.toLowerCase() ];
    if( user && id && user.id !== id ){
      trace( "BUG, inconsistent screen_name & id, try id" );
      user = null;
      debugger;
    }
  }
  if( id && !user ){
    user = AllTwitterUsers[ id ];
    if( user 
    && screen_name 
    && user.screen_name 
    && user.screen_name !== screen_name
    ){
      trace( "BUG, inconsistent screen_name & id, update screen name" );
      debugger;
      var other_user = TwitterUsersByScreenName[ screen_name ];
      if( other_user ){
        user = other_user;
        AllTwitterUsers[ id ] = other_user;
        trace( "Fix, new" );
      }
      user.screen_name = screen_name;
      TwitterUsersByScreenName[ screen_name ] = user;
    }
  }
  var machine = Ephemeral.Machine.current;
  if( user ){
    // trace( "Twitter, update user", id );
    var changed = false;
    if( !user.id && id ){
      user.id = id;
      AllTwitterUsers[ id ] = user;
      CachedListOfUsers = null;
      changed = true;
    }
    if( !user.screen_name && screen_name ){
      user.screen_name = screen_name;
      TwitterUsersByScreenName[ screen_name.toLowerCase() ] = user;
      changed = true;
    }
    if( persona ){
      persona._twitter_user = user; // _ to please Ephemeral
    }
    if( twitter_user_data.name ){
      user.set_twitter_user_data( twitter_user_data );
      changed = true;
    }
    if( user.machines.indexOf( machine ) === -1 ){
      user.machines.push( machine );
      user.persona_by_machine_id[ machine.id ] = persona;
    }
    if( changed ){
      user.time_touched = l8.update_now();
    }
    user.collect_friends();
    return user;
  }
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
  this.persona = null; // in main machine, if ever
  this.machines = [ machine ];
  this.persona_by_machine_id = map();
  this.persona_by_machine_id[ machine.id ] = persona;
  if( persona ){
    persona._twitter_user = this;
  }
  this.friends = map();
  this.friends_count = 0;
  this.followers = map();
  this.followers_count = 0;
  this.locality_factor = 1;  // ratio of local followers
  this.action_rate = 0; // weekly activity, post & likes
  this.cached_friends = null;
  this.cached_followers = null;
  this.time_friends_collected = 0;
  this.time_last_changed = 0;
  this.time_touched = now;
  this.rank_created = TwitterUserCount;
  this.time_created = now;
  this.age = 0;
  this.is_community = false; // special #suvranu user is the community
  if( false && TwitterUserCount > 2800 ){
    trace( "Creating TwitterUser " + this + ", number ", TwitterUserCount );
  }
  TwitterUserCount++;
  if( twitter_user_data.name ){
    this.set_twitter_user_data( twitter_user_data, now );
  }else{
    this.twitter_user_data = null;
    this.time_twitter_user_data = 0;
  }
  this.collect_friends();
}


TwitterUser.register = function( user_data, persona ){
  return new TwitterUser( user_data, persona );
};


TwitterUser.get_community_size = function(){
  return TwitterUserCount;
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


TwitterUser.prototype.set_twitter_user_data = function( data ){
  var first_time = !this.twitter_user_data;
  this.twitter_user_data = data;
  this.time_twitter_user_data = l8.now;
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
  if( first_time && Kudo.TrustActor ){
    Kudo.TrustActor.register( this );
  }
};


TwitterUser.prototype.is_active = function(){
  var data = this.twitter_user_data;
  if( !data )return false;
  var status = data.status;
  if( !status )return false;
  var created_at = status.created_at;
  if( !created_at )return false;
  var date = new Date( Date.parse( created_at.replace( /( \+)/, ' UTC$1' ) ) );
  var time = date.getTime();
  var age = l8.now - time;
  var days = Math.ceil( age / ( 24 * 60 * 60 * 1000 ) );
  return days <= 10;
};


TwitterUser.prototype.get_friends = function(){
  var list = [];
  var friends = this.friends;
  for( var key in friends ){
    var friend = friends[ key ];
    if( !friend )continue;
    list.push( friend );
  }
  return list;
};


TwitterUser.prototype.get_followers = function( bool_community ){
  // Most of the time, the followers of the community are skipped
  if( !bool_community && this.is_community )return [];
  if( this.cached_followers )return this.cached_followers;
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
  // Locality factor depends on ratio of local followers over total
  var twitter_data = this.twitter_user_data;
  if( twitter_data ){
    var nfollowers = twitter_data.followers_count;
    if( !nfollowers ){
      nfollowers = 1;
    }
    if( this.followers_count > nfollowers ){
      trace(
        "BUG, local followers count greater that twitter's count for " + this,
        "is", this.followers_count, "vs", nfollowers
      );
      nfollowers = this.followers_count;
    }
    var ratio = this.followers_count / nfollowers
    this.locality_factor = ratio;
  }
  this.cached_followers = list;
  return this.get_followers();
  return list;
};


var FriendshipCount = 0;
var FollowershipCount = 0;

TwitterUser.prototype.add_friend = function( twitter_user ){
  if( !twitter_user )return;
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
    return;
  }
  friends[ twitter_user.id ] = twitter_user;
  this.friends_count++;
  FriendshipCount++;
  this.cached_friends = null;
  // Add this user to the friend's list of followers
  if( twitter_user.followers[ this.id ] ){
    trace( 
      "BUG? follower presence while adding friend " + twitter_user,
      "to " + this
    );
    if( twitter_user.followers[ this.id ].id !== this.id ){
      trace( "BUG, weird follower " + twitter_user.followers[ this.id ] );
    }
    // ToDo: find where the follower was previously added...
    FollowershipCount++;
  }else{
    twitter_user.followers[ this.id ] = this;
    twitter_user.followers_count++;
    FollowershipCount++;
    if( twitter_user.twitter_user_data ){
      if( twitter_user.twitter_user_data.followers_count
      <   twitter_user.followers_count )
      {
        trace(
          "BUG, local followers count greater than twitter's for",
          "" + twitter_user + ",",
          "is", twitter_user.followers_count,
          "vs", twitter_user.twitter_user_data.followers_count
        );
      }
    }
    twitter_user.cached_followers = null;
  }
  if( FriendshipCount !== FollowershipCount ){
    trace( 
      "BUG, friendship", FriendshipCount, 
      "vs", "followership", FollowershipCount
    );
  }
  return this;
};


TwitterUser.prototype.remove_friend = function( twitter_user ){
  if( !twitter_user )return;
  var friends = this.friends;
  var old_friend_id = twitter_user.id;
  if( friends[ old_friend_id ] ){
    friends[ twitter_user.id ] = null;
    this.cached_friends = null;
    this.friends_count--;
    if( !twitter_user.followers[ this.id ] ){
      trace( "BUG? missing follower " + this + "of " + twitter_user );
    }else{
      twitter_user.followers[ this.id ] = null;
      twitter_user.followers_count--;
      this.cached_followers = null;
    }
  }else{
    // Attempt to remove a non friend
  }
  return this;
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
  
  if( this.collect_scheduled )return false;
  this.collect_scheduled = true;
  
  var that = this;
  var now = l8.update_now();
  
  function reschedule( delay ){
    if( dont_schedule )return false;
    var now = l8.update_now();
    if( !delay ){
      // Rate limit of 15 requests within 15 minutes window
      delay = 60 * 1000;
    }
    if( ( now - TimeRateExcess ) < 15 * 60 * 1000 ){
      delay = ( 15 + 5 * Math.random() ) * 60 * 1000;
    }
    BacklogSize++;
    setTimeout(
      function(){
        that.collect_scheduled = false;
        BacklogSize--;
        that.collect_friends();
        if( ! BacklogSize ){
          trace( "Twitter friends collection backlog is now emppty" );
        }
      },
      delay
    );
    return false;
  }
  
  // Don't do too often for same user, once a week, rate limit is one per min
  function uptodate( user ){
    var age_collected = now - user.time_friends_collected;
    return age_collected < 7 * 24 * 3600 * 1000;
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
    list.sort( function( a, b ){
      var a_count = a.followers_count;
      if( !a.is_active() ){
        a_count = 0;
      }
      if( !b.is_active() ){
        b_count = 0;
      }
      var b_count = b.followers_count;
      if( a_count <  b_count )return  1;
      if( a_count == b_count )return  0;
      return                         -1;
    });
    var candidate;
    var this_len = this.get_followers().length;
    for( var ii = 0 ; ii < list.length ; ii++ ){
      candidate = list[ ii ];
      if( candidate.get_followers().length <= this_len )continue;
      if( !candidate.collect_scheduled )continue;
      candidate.collect_scheduled = false;
      if( uptodate( candidate ) )continue;
      done = candidate.collect_friends( true /* don't reschedule */ );
      if( true || done ){
        trace( 
          "Prioriy update of " + candidate, done ? "done," : "delayed,",
          "it has", candidate.get_followers().length, "followers"
        );
        break;
      }
    }
    if( done )return reschedule();
  }
  
  // Don't try until profile is filled
  if( !this.id )return reschedule();
  
  var twit = AllMonitoredPersonas[ 0 ].twit;

  TimeFriendCollectorBusy = now;
  var previous_time_last_update = that.time_friends_collected;
  that.time_friends_collected = now;
  twit.get(
    "friends/ids",
    { screen_name: this.screen_name },
    function( err, data, response ){
      if( err ){
        that.time_friends_collected = previous_time_last_update;
        if( err.code === 88 ){
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
      trace( "ids received in collect_friends() for user " + that );
      TimeRateExcess = 0;
      
      // Detect added and removed friends
      var old_friends = map();
      var current_friends = that.friends;
      for( var old_friend_id in current_friends ){
        old_friends[ old_friend_id ] = old_friend_id;
      }
      var added_friends = [];
      var removed_friends = [];

      // For each friend
      var list = data.ids;
      var id;
      var friend_user;
      for( var ii = 0 ; ii < list.length ; ii++ ){
        id = "" + list[ ii ];
        friend_user = AllTwitterUsers[ id ];
        // Skip if not part of the community yet
        if( !friend_user )continue;
        that.add_friend( friend_user );
        // Detect new friend
        if( !old_friends[ id ] ){
          added_friends.push( friend_user );
          // trace( "New friend " + friend_user, "of "+ that );
        }
      }
      
      // Detect removed friends
      for( id in old_friends ){
        friend_user = that.friends[ id ];
        if( that.friends[ id ] )continue;
        removed_friends.push( friend_user );
        trace( "Removed friend " + friend_user, "of " + that );
      }
      
      that.time_friends_collected = l8.update_now();
      if( BacklogSize ){
        trace( "Done collecting friends of " + that );
      }
  });
  
  return true;
  
};


var TimeLastSaved = 0;
var LastSavedJson = "";
var LastSavedData = null;
var CacheFileIsValid = false;

TwitterUser.save = function(){
// Data are saved in some disk based cache to respect Twitter rate limits

  var now = l8.update_now()
  var age = now - TimeLastSaved;
  var period = 10 * 1000;
  if( age < period ){
    setTimeout( TwitterUser.save, period );
    return;
  }

  if( BacklogSize ){
    trace( 
      "Still", BacklogSize, "users in twitter backlog.",
      UpdatedFriendsCount, "Updated friends."
    );
  }

  if( TimeRateExcess ){
    var duration = now - TimeRateExcess;
    trace( 
      "Twitter rate excess since", duration, "ms,",
      Math.round( duration / 60000 ), "min"
    );
  }

  var changed = false;
  var undef;
  var users = [];
  var users_count = 0;

  for( var user_idx in AllTwitterUsers ){
    
    var user = AllTwitterUsers[ user_idx ];
    // if( !user.screen_name )continue;
    users_count++;
    
    var user_data = {
      id: user.id,
      screen_name: user.screen_name,
      time_touched: user.time_touched,
      time_last_changed: user.time_last_changed,
      time_friends_collected: user.time_friends_collected,
      twitter_user_data: undef, // not full user.twitter_user_data,
      time_twitter_user_data: user.time_twitter_user_data,
      friends: [],
      followers: []
    };
    
    // Cache some data from the twitter user profile
    var src = user.twitter_user_data;
    var dst = user_data.twitter_user_data;
    if( dst ){
      dst = {}; 
      dst.name              = src.name;
      dst.url               = src.url;
      dst.profile_image_url = src.profile_image_url;
      dst.followers_count   = src.followers_count;
    }
    
    if( !changed && LastSavedData ){
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

    users.push( user_data );

    var friends = user.friends;
    for( var friend_idx in friends ){
      var friend = friends[ friend_idx ];
      if( !friend.id ){
        debugger;
        continue;
      }
      // CHeck validity
      if( !friend.followers[ user.id ] ){
        trace( "BUG, missing followership of " + user + " by " + friend );
      }
      // Update followers previously unresolved
      user.add_friend( friend );
      user_data.friends.push( friend.id );
    }

    var followers = user.followers;
    for( var follower_idx in followers ){
      var follower = followers[ follower_idx ];
      // CHeck validity
      if( !follower.friends[ user.id ] ){
        trace( "BUG, missing friendship of " + user + " by " + follower );
      }
      // Update friendships previously unresolved
      follower.add_friend( user );
      if( !follower.id ){
        trace( "BUG? unidentified follower " + follower, "of " + user );
      }else{
        user_data.followers.push( follower.id );
      }
    }
  }

  if( LastSavedData ){
    if( users_count !== LastSavedData.users.length ){
      trace( 
        "Number of users changed, was", LastSavedData.users,
        ", is now", users_count
      );
    }
  }
  
  var new_image = { meta: { time_saved: now }, users: users };
  
  var json = JSON.stringify( new_image );
  if( !LastSavedJson
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
    if( CacheFileIsValid ){
      fs.writeFileSync( "twitter_users.json", JSON.stringify( users ), "utf8" );
    }else{
      console.warn( "SOMETHING BAD with file twitter_users.json" );
    }
    LastSavedData = new_image;
    LastSavedJson = json;
    var now2 = l8.update_now();
    trace(
      "Twitter, save in", now2 - now, "ms,",
      "user count:", users.length
    );
  }
  
  TimeLastSaved = l8.now;
  TwitterUser.save();
}; // save()


TwitterUser.load = function(){
  
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
    return;
  }
  
  // Save a backup
  try{
    fs.writeFileSync( "twitter_users.json.bak", text, "utf8" );
  }catch( err ){
    console.warn( "Could not save twitter_users.json.bak" );
  }

  CacheFileIsValid = true;
  
  var meta = data.meta;
  var users = data.users;
  if( !meta ){
    users = data;
  }
  
  // Don't use twitter API while loading
  TimeFriendCollectorBusy = now;
  
  var user_data;
  var user;
  var friendships_count = 0;
  var followships_count = 0;
  
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
    return age_collected < 7 * 24 * 3600 * 1000;
  }
  
  // Then populate friendships and other data
  for( ii = 0 ; ii < users.length ; ii++ ){
    user_data = users[ ii ];
    user = TwitterUser.find_by_id( user_data.id );
    user.set_twitter_user_data( user_data, user_data.time_twitter_data );
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
        trace( "BUG, bad friend_id in load()" );
        return;
      }
      if( friend_id.length < 7 ){
        trace( "BUG, bad id in load()", friend_id );
        return;
      }
      user.add_friend( TwitterUser.register( { id: friend_id } ) );
      friendships_count++;
    } );
    user_data.followers.forEach( function( follower_id ){
      if( !follower_id ){
        nde&&bug( "BUG, bad follower_id in load()" );
        return;
      }
      TwitterUser.register( { id: follower_id } ).add_friend( user );
      followships_count++;
    } );  
    if( friendships_count !== followships_count ){
      nde&&bug( 
        "BUG, followships not equal to friendships,", 
        followships_count, "vs", friendships_count
      );
    }
  }
  trace( 
    "File 'twitter_users.json', time to load:", l8.update_now() - now,
    "ms for", users.length, "users with", friendships_count, "friendships"
  );
  if( friendships_count !== followships_count ){
    trace( 
      "BUG, total followships not equal to friendships,",
      followships_count, "vs", friendships_count
    );
  }
}; // load()


/* ---------------------------------------------------------------------------
 *  MonitoredPersona class
 */

// npm install twit - https://github.com/ttezel/twit
var Twit = require( "twit" );

var AllPersonas = [];
var AllMonitoredPersonas = [];
var AllMonitoredPersonasById;


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
  this.twitter_user.is_community = true;

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
  var friends = event.kudocracy_friends || event.friends;
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
          skip_status: "true",
          count: 5000 // Max supported by twitter
        },
        MonitoredPersonaProto.process_kudocracy_list_members_response.bind( that, event )
      );
      // Postpone collecting friends while collecting community members
      TimeFriendCollectorBusy = l8.update_now();
      return;
    }
  }
  if( start >= friends.length ){
    trace( "Twitter friends all processed, " + friends.length );
    setTimeout( TwitterUser.save, 60 * 1000 );
    return;
  }
  var friends_slice = friends.slice( start, start + 100 );
  var that = this;
  nde&&bug( "Twitter friends to process:", start, "until", friends.length );
  friends_slice.forEach( function( id ){
    var user = TwitterUser.register( { id_str: "" + id } );
    that.twitter_user.add_friend( user );
  } );
  // Get info on next 100 friends (twitter limit, 100 friends per request)
  event.lookup_start = start + 100;
  nde&&bug( "Twitter, send users/lookup request about " + this );
  var params = { user_id: friends_slice, include_entities: false };
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
      that.twitter_user.add_friend( TwitterUser.register( user ) );
      
    }else{
      // This friend is known, attach twitter user info to the persona
      trace(
        "Twitter user", user.screen_name, "found for " + persona,
        "friend of " + that.persona
      );
      var twitter_user = TwitterUser.register( user, persona );
      that.twitter_user.add_friend( twitter_user );
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
    trace(
      "BUG? twitter tweet from unknow (new?) user:", from, "text:", event.text
    );
    return;
  }
  
  if( !for_cli ){
    nde&&bug( "Twitter, tweet from " + twitter_user, "text:", event.text );
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
  TwitterFriendsByScreenName = map();
  UpdatedFriends = map();
  AllMonitoredPersonasById = map();

  console.log( "Ready to listen for Twitter CLI ervents" );
  
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
