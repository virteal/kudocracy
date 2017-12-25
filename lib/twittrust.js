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
  // Exports
  Kudo.TrustActor = TrustActor;
}


// Table of known tweets
var AllTweetsById = {};

// Table of tweets per author
var AllTweetsByAuthor = {};

// Table of all actors
var AllActors = {};


function add_tweet( tweet ){
  // Check if already there
  var there_already = false;
  if( there_already )return;
}


var update_queue = [];
var busy = false;


function update_user( name ){
  update_queue.push( name );
  process_queue();
}


function process_queue(){
  if( busy )return;
  var tail = update_queue.shift();
  if( !tail )return;
  busy = true;
  _update_user( tail );
}


function _update_user( name ){
  var user = register_user( name );
  if( !user ){
    busy = false;
    process_queue();
    return;
  }
}


function TrustActor( name ){
  var user = AllActors[ name ];
  if( user )return user;
  // Init new user
  this.name = name;
  this.time_created = Kudo.now();
  this.AllTweets = {};
  return this;
}


function get_list_of_friends( name, seen ){
  if( !seen ){
    seen = [];
  }
  var user = seen[ name ];
  if( user )return seen;
  seen[ name ] = user = register_user( name );
  var friends = Kudo.get_delegates( user );
  for( var friend in friends ){
    get_list_of_friends( friend, seen );
  }
  return seen;
}


/* ---------------------------------------------------------------------------
 *  Start monitoring. Main entry point. Called from ui1.js at startup.
 */
 
exports.start = function( ui1_server ){
  
  // Import stuff from main.js, shared with ui1_server defined in ui1core.js
  Ui1Server = ui1_server;
  process_kudo_imports( ui1_server.get_kudo_scope() );
  
  console.log( "Ready to listen for Twitter favorites" );
  
};
