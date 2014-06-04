// test/vote.js
//  sample test application: reactive liquid democracy
//
// "When liquid democracy meets Twitter..."
//
// april 2014 by @jhr
// june 2014 by @jhr, move from l8/test/votes.js, 6800 LOC

var Kudo = { store: "vote.json.log" }; // ToDo: "file://vote.json.log"

require( "./ephemeral.js" )( Kudo );

var l8        = Kudo.l8;
var Event     = Kudo.Event;
var Effect    = Kudo.Effect;
var Ephemeral = Kudo.Ephemeral;

// My de&&bug() and de&&mand() darlings
var de      = false;
var trace   = Kudo.trace;
var bug     = trace;
var bugger  = Kudo.bugger;
var error_traced = Kudo.error_traced;
var mand    = Kudo.assert;
var assert  = Kudo.assert;

// More imports
var value   = Kudo.value;
var pretty  = Kudo.pretty;
var water   = Kudo.water;
var diff    = Kudo.diff;
var _       = Kudo._;
//debugger;


var namize_cache = {};

function namize( label ){
  // Twitter name & hashtags are case insensitive but are displayed with case
  if( !label )return label;
  var tmp = namize_cache[ label ];
  if( tmp )return tmp;
  tmp = label.toLowerCase();
  namize_cache[ label ] = tmp;
  namize_cache[ tmp ] = tmp;
  return tmp;
}

function name_equal( a, b ){
  return namize( a ) === namize( b );
}


/*
 *  Persona entity
 *
 *  Individuals and groups.
 *
 *  Individuals can vote. Vote is about topics, either propositions or tags.
 *  Multiple votes on the same topic are possible, new vote erases the previous
 *  one. Delegations of voting power can be established, based on tags and
 *  given to an agent who can vote (or delegate) on behalf of the delegator.
 *
 *  Individual's label the twitter name of some twitter account, possibly an
 *  account bound to a "true human person" or a fake or whatever emerges (AI,
 *  ...). One individual, one vote.
 *
 *  Groups are personas that don't vote. However, groups have orientations like
 *  individuals. As a result, one can delegate to a group. The orientation of
 *  a group is the consolidation of the orientations of the group members,
 *  where each member's orientation is weighted according to the number of
 *  members in it (group members can be groups themselves).
 *
 *  Group's label is the twitter name of some twitter account. As a result,
 *  the management of the membership is done by whoever controls that
 *  twitter account. To add a member, follow that member.
 *
 *  Attributes:
 *    - Entity/id
 *    - Effect/key
 *    - label            -- unique name, idem to key
 *    - role             -- "individual" or "group"
 *    - members          -- friends or group's members
 *    - memberships      -- to groups
 *    - delegation       -- of persona to agent, about tagged topics
 *    - delegation_from  -- idem, agent's side, relation is bidirect
 *    - votes            -- all votes, both direct & indirect
 */

Ephemeral.type( Persona );
function Persona( options ){

  this.label            = options.label || options.key;
  this.name             = namize( this.label );
  this.identity( this.name );

  var persona = this.register( this.name );
  var water   = this.water( persona );

  this.role             = options.role || Persona.individual;
  this.members          = water( [] );
  this.memberships      = water( [] );
  this.delegations      = water( [] );
  this.delegations_from = water( [] );
  this.votes            = water( [] );
  // ToDo: total number of votes, including votes for others.
  // This would make it easy to detect "super delegates"

  // ToDo: test update()
  if( this.is_update() )return persona.update( this );

  // Increase default expiration
  this.duration( options.duration || Kudo.ONE_YEAR );

  // Indexes, for faster access
  this._votes_indexed_by_proposition = {};
}

// Persona roles
Persona.individual = "individual";
Persona.group      = "group";

Persona.prototype.is_group      = function(){ return this.role === "group"; };
Persona.prototype.is_individual = function(){ return !this.is_group();      };

Persona.find = function( key ){
// Key are case insensitive on twitter
  return Persona.basic_find( namize( key ) );
}

Persona.prototype.touch = function(){
  var delay = this.expire() - ( this.time_touched = Kudo.now() );
  // If touched after mid life, extend duration to twice the current age
  if( delay < this.age() / 2 ){
    this.renew( this.age() * 2 );
  }
  Persona.super.prototype.touch.call( this );
};


Persona.prototype.get_vote_on = function( proposition ){
// If there is a vote by persona on said topic, return it, or null/undef
  de&&mand( proposition.is_a( Topic ) );
  var found_vote = this._votes_indexed_by_proposition[ proposition.key ];
  if( typeof found_vote !== "undefined" )return found_vote;
  this.votes().every( function( vote ){
    if( vote.proposition === proposition ){
      found_vote = vote;
      return false;
    }
    return true;
  });
  trace( "BUG? unexpected vote on " + proposition + " of " + this );
  this._votes_indexed_by_proposition[ proposition.key ] = found_vote || null;
  return found_vote;
};

Persona.prototype.get_orientation_on = function( proposition ){
// Return orientation on topic if it exits, or else undefined
  de&&mand( proposition.is_a( Topic ) );
  var vote = this.get_vote_on( proposition );
  return vote && vote.orientation();
};

Persona.prototype.add_delegation = function( delegation, loop ){
// Called when a delegation is created. This will also add the reverse
// relationship (delegation_from), on the agent's side.
  de&&mand( delegation.is_a( Delegation ) );
  de&&mand( delegation.persona === this );
  var delegations = this.delegations() || [];
  if( delegations.indexOf( delegation ) !== -1 ){
    trace( "BUG? Delegation already added " + delegation
      + ", persona: " + this
      + ", agent: " + delegation.agent
    );
    return this;
  }
  var now = delegations.slice(); // ToDo: need a copy?
  now.push( delegation );
  de&&bug( "Add delegation " + delegation
   + " for persona " + this 
   + " for topics tagged " + pretty( delegation.tags() )
   + " to agent " + delegation.agent
  ); 
  this.delegations( now );
  if( !loop ){
    delegation.agent.add_delegation_from( delegation, true );
  }
  return this;
};

Persona.prototype.add_delegation_from = function( delegation, loop ){
// Called by Persona.add_delegation() to sync the agent side of the
// one to one bidirectional relation.
  de&&mand( delegation.agent === this );
  var delegations_from = this.delegations_from() || [];
  if( delegations_from.indexOf( delegation ) !== -1 ){
    trace( "BUG? Delegation 'from' already added: " + delegation
      + ", agent: " + delegation.agent
      + ", persona: ", delegation.persona
    );
  }
  var now = delegations_from.slice();
  now.push( delegation );
  de&&bug( "Add delegation " + delegation
   + " by agent " + this 
   + " for topics tagged " + pretty( delegation.tags() )
   + " from persona " + delegation.persona
  ); 
  this.delegations_from( now );
  if( !loop ){
    delegation.persona.add_delegation( delegation, true );
  }
  return this;
};


Persona.prototype.vote_for_others = function( vote ){
// When a persona was given delegation, her vote may cascade into votes for
// other personas, on the same proposition.
  de&&mand( vote.persona === this );
  var persona     = this;
  var orientation = vote.orientation();
  var proposition = vote.proposition;
  var delegations_from = this.delegations_from() || [];
  if( !delegations_from.length )return this;
  de&&bug( "Persona " + persona + " votes " + orientation
    + " on proposition " + vote.proposition
    + " for at most " + delegations_from.length + " other personas"
  );
  //debugger;
  delegations_from.forEach( function( delegation ){
    if( proposition.is_tagged( delegation.tags() ) ){
      de&&bug( "Cascade delegated vote by " + persona
        + " on behalf of " + delegation.persona 
        + " for proposition: " + proposition
        + ", orientation: " + orientation
      );
      var vote = Vote.create({
        persona:     delegation.persona,
        delegation:  delegation,
        proposition: proposition,
        orientation: orientation
      });
      // Remember all votes due to the said delegation
      delegation.track_vote( vote );
    }
  });
  return this;
};

Persona.prototype.delegates_to = function( agent, tags, seen ){
// Predicate to assert the existence of a delegation by a persona to some
// agent, directly or indirectly.
  if( !seen ){ seen = {}; }
  if( seen[ this.id ] ){
    trace( "Loop detected when looking for agent " + agent );
    return false;
  }
  seen[ this.id ] = true;
  return !this.delegations().every( function( delegation ){
    return !delegation.delegates_to( agent, tags, seen );
  });
};


Persona.prototype.find_applicable_delegations = function( proposition ){
  var found_delegations = [];
  var delegations = this.delegations();
  delegations.forEach( function( delegation ){
    if( delegation.is_active()
    && delegation.includes_proposition( proposition )
    ){
      found_delegations.push( delegation );
    }
  });
  return found_delegations;
};

Persona.prototype.track_vote = function( vote ){
// Called by Vote constructor
  de&&mand( vote.persona === this );
  var votes = this.votes();
  de&&mand( votes.indexOf( vote ) === -1 );
  votes.push( vote );
  this.votes( votes );
  this._votes_indexed_by_proposition[ vote.proposition.key ] = vote;
  return this;
};

Persona.prototype.add_member = function( member ){
  var members = this.members();
  de&&mand( members.indexOf( member ) === -1 );
  members.push( member );
  this.members( members );
  return this;
};

Persona.prototype.remove_member = function( member ){
  var members = this.members();
  var idx     = members.indexOf( member );
  if( idx === -1 )return this;
  members.splice( idx, 1 );
  this.members( members );
  return this;
};

Persona.prototype.is_member_of = function( group ){
  // ToDo: add index to speed things up
  // return group.members_indexed_by_persona( this.key );
  return group.members().indexOf( this ) !== -1;
};

Persona.prototype.has_member = function( persona ){
  return persona.is_member_of( this );
};

Persona.prototype.add_membership = function( membership ){
  var memberships = this.memberships();
  de&&mand( memberships.indexOf( membership ) === -1 );
  // Remember index inside persona's .memberships[], to speed up removal
  // ToDo: use an hashmap?
  membership.insert_index = memberships.length;
  memberships.push( membership );
  this.memberships( memberships );
  return this;
};

Persona.prototype.remove_membership = function( membership ){
  var memberships = this.memberships();
  var idx = membership.insert_index;
  de&&mand( typeof idx !== "undefined" );
  // ToDo: quid of compaction?
  memberships[ idx ] = _;
  membership.insert_index = _;
  // memberships.splice( idx, 1 );
  // Not cloned, not needed
  this.memberships( memberships );
  return this;
};


/*
 *  Source entity
 *
 *  - Describes the "reference material" that explains why a topic was created
 *  - or why a vote was assigned to some persona when that vote does not come
 *    from the persona herself. Note: a twitter persona can override such
 *    votes, as she is the most legitimate source.
 */

Ephemeral.type( Source );
function Source( options ){
  this.topic   = options.topic;
  this.persona = options.persona;
  this.label   = options.label;
  this.url     = options.url;
}


/*
 *  A Tweet entity.
 */

Ephemeral.type( Tweet );
function Tweet( options ){

  de&&mand( options.persona );
  de&&mand( options.id_str );

  this.persona     = options.persona;
  this.label       = options.id_str;
  this.text        = options.text || "?";
  this.user        = options.user; // id_str of the user
  this.screen_name = options.screen_name || "?"; // What comes after @
  this.name        = options.name || this.screen_name;
  this.vote        = water( options.vote ); // When associated to a vote
  this.topic       = water( options.topic || (options.vote && options.vote.proposition ) );
  this.api         = options.api; // Whatever the Twitter API provides
  this.origin      = options.origin || Tweet.received;
}

// Tweet origin
Tweet.sent     = "sent";     // Tweet sent to twitter
Tweet.received = "received"; // Tweet received from twitter


/*
 *  Topic entity
 *
 *  Proposition topics are the ultimate target of votes.
 *    their source, when known, is typically a tweet.
 *    they can be tagged.
 *  Tag topics help to classify propositions. 
 *    they don't have a source, maybe.
 *    they can be tagged & voted on too, like propositions => folksonomy
 *
 *  Attributes
 *    - Entity/id
 *    - Effect/key
 *    - label        -- name of proposition (an hash word) or #xxxx tag
 *    - name         -- lowercase version of label, key
 *    - persona      -- potential author of topic, null if system origin
 *    - source       -- source could be a url, typically
 *    - comment      -- a comment that describes the topic
 *    - comments     -- all the comments
 *    - propositions -- tags track the propositions they tag
 *    - delegations  -- tags track the delegations they impact, can be huge!
 *    - tags         -- propositions & tags track the tags assigned to them
 *    - votes_log    -- propositions & tags track all the votes about them
 *    - result       -- the result of votes on the topic
 */
 
Ephemeral.type( Topic );
function Topic( options ){
  
  de&&mand( options.label );

  this.label = options.label;
  this.name  = namize( this.label );
  this.identity( this.name );

  var topic = this.register( this.name );
  var water = this.water( topic );
  
  this.source       = water( options.source );
  this.votes_log    = water( options.votes_log );
  this.propositions = water( options.propositions );
  this.tags         = water( options.tags );
  this.delegations  = water( options.delegations );
  this.persona      = water( options.persona );
  this.comment      = water( options.comment );
  this.comments     = water( options.comments );
  this.result       = options.result
    || ( this.is_create() && Result.create({ proposition: this } ) );

  // ToDo: implement .update()?
  if( this.is_update() )return topic.update( this );

  if( !options.votes_log   ){ this.votes_log(   [] ); }
  if( !options.delegations ){ this.delegations( [] ); }
  if( !options.comments    ){ this.comments(    [] ); }

  //de&&mand( this.delegations()  );
  
  // Let's tag the propositions
  if( options.propositions ){
    options.propositions.forEach( function( proposition ){
      proposition.add_tag( topic );
    });
  }else{
    topic.propositions( [] );
  }
  
  // Let the tags know that a new proposition uses them
  if( options.tags ){
    options.tags.forEach( function( tag ){
      if( !tag.propositions ){
        trace( "Missing .propositions for tag " + tag, value( tag, true ) );
      }
      de&&mand( tag.propositions && typeof tag.propositions === "function" );
      tag.add_proposition( topic );
    });
  }else{
    topic.tags( [] );
  }
}

Topic.find = function( key ){
  return Topic.basic_find( namize( key ) );
}

Topic.prototype.update = function( other ){
  // ToDo: handle .tags and .propositions changes
  this.persona(  other.persona  );
  this.source(   other.source   );
  this.comments( other.comments );
  if( other.result ){ this.result = other.result };
  if( other.delegations ){ this.update_delegations( other.delegations ); }
  return this;
};


Topic.prototype.touch = function(){
  var delay = this.expire() - ( this.time_touched = Kudo.now() );
  // If touched after mid life, extend duration to twice the current age
  if( delay < this.age() / 2 ){
    this.renew( this.age() * 2 );
  }
  Topic.super.prototype.touch.call( this );
};


Topic.prototype.update_delegations = function( list ){
  trace( "ToDo: update delegations" );
  this.delegations( list );
  return this;
};

Topic.prototype.is_proposition = function(){ return this.label[0] !== "#"; };
Topic.prototype.is_tag         = function(){ return !this.is_proposition(); };

Topic.prototype.orientation = function(){
  return this.result.orientation();
}

Topic.prototype.heat = function( persona ){
// Compute the "heat" of a topic. "Hot topics" should come first.
// If persona is specified and never voted the topic, it doubles the heat
  var touched = this.result.time_touched || this.time_touched;
  // Recently touched are hot
  var age = Kudo.now() - touched;
  // Double the heat if not voted by persona (and not too old however)
  if( persona && !Vote.find( "" + persona.name + "." + this.name ) ){
    touched = touched * 2;
    if( age < Kudo.ONE_MONTH )return touched;
  }
  if( age < Kudo.ONE_MINUTE )return touched;
  if( age < Kudo.ONE_HOUR   )return touched;
  // Less recently touched topics are hot depending on number of direct votes
  // Less recently touched tags are hot depending on number of propositions
  return this.is_tag() ? this.propositions().length : this.result.direct();
};


Topic.prototype.filter_string = function( persona ){
  var tags = this.tags() || [];
  var sorted_tags = tags.sort( function( a, b ){
    // Most agreed first
    var a_rank = a.result.orientation() + a.result.direct();
    var b_rank = a.result.orientation() + a.result.direct();
    if( a < b )return -1;
    if( a > b )return  1;
    return 0;
  })
  var buf = [];
  sorted_tags.forEach( function( tag ){
    buf.push( tag.label );
  });
  return ( buf.join( " " ) + this.computed_tags( persona ) ).trim();
};

Topic.reserved_tags = {
  all:        true,
  but:        true,
  and:        true,
  or:         true,
  not:        true,
  vote:       true,
  tag:        true,
  new:        true,
  hot:        true,
  spam:       true,
  nsfw:       true,
  recent:     true,
  old:        true,
  today:      true,
  yesterday:  true,
  fade:       true,
  protest:    true,
  orphan:     true,
  referendum: true,
  persona:    true,
  topic:      true,
  result:     true,
  group:      true,
  membership: true,
  tagging:    true,
  delegation: true,
  yes:        true,
  no:         true,
  ok:         true,
  ko:         true,
  on:         true,
  off:        true,
  true:       true,
  false:      true,
  null:       true,
  undefined:  true,
  me:         true,
  you:        true,
  them:       true,
  abuse:      true,
  win:        true,
  blank:      true,
  tie:        true,
  jhr:        true  // End Of List
};

Topic.reserved_tags_comments = {
  all:        "Filter tag for tag inclusion detection, opposite to #but",
  but:        "Filter tag for tag exclusion detection, opposite to #all",
  and:        "Filter tag, not implemented yet, default logic is 'and' already",
  or:         "Filter tag, not implemented yet, future 'or' logic operator",
  not:        "Filter tag, not implemented yet, future 'not' logic operator",
  vote:       "propositions with a vote from you",
  tag:        "propositions about tags themselves",
  new:        "propositions without a vote from you",
  hot:        "propositions supposedly worth considering",
  spam:       "spam propositions, not implemented yet",
  nsfw:       "nsfw propositions, not implemented yet",
  recent:     "propositions with recent activity, opposite to #old",
  old:        "propositions without recent activity, opposite to #recent",
  today:      "propositions updated during the last 24 hours",
  yesterday:  "propositions updated during the last 48 hours but not today",
  fade:       "propositions that are fading away",
  protest:    "propositions with more than 1% of protest votes",
  orphan:     "tags with a single proposition",
  referendum: "propositions with votes from 1% of visitors",
  persona:    "propositions about a persona",
  topic:      "propositions about a topic, not implemented yet",
  result:     "propositions about some other results",
  group:      "propositions about a group persona",
  membership: "propositions about a group membership",
  tagging:    "propositions about a tagging action",
  delegation: "propositions about a delegation setup",
  yes:        "not implemented yet, reserved",
  no:         "not implemented yet, reserved",
  ok:         "not implemented yet, reserved",
  ko:         "not implemented yet, reserved",
  on:         "not implemented yet, reserved",
  off:        "not implemented yet, reserved",
  true:       "not implemented yet, reserved",
  false:      "not implemented yet, reserved",
  null:       "not implemented yet, reserved",
  undefined:  "not implemented yet, reserved",
  me:         "not implemented yet",
  you:        "propositions about you, not implemented yet",
  them:       "propositions not about you, not implemented yet",
  abuse:      "propositions with a majority of 'protest' votes",
  win:        "propositions with a majority of 'agree' votes",
  blank:      "propositions with a majority of 'blank' votes",
  tie:        "propositions with a for/against votes equality",
  jhr:        "not implemeted yet, virteal!"  // End Of List
};


Topic.reserved = function( tag ){
  if( !tag )return false;
  if( tag[0] === "#" ){
    tag = tag.substring( 1 );
  }
  // One letter tags are all reserved for future use
  if( tag.length < 2 )return true;
  return !!Topic.reserved_tags[ tag.toLowerCase() ];
};

Topic.reserved_comment = function( tag ){
  if( !tag )return null;
  if( tag[0] === "#" ){
    tag = tag.substring( 1 );
  }
  // One letter tags are all reserved for future use
  if( tag.length < 2 )return "reserved short tag";
  return Topic.reserved_tags_comments[ tag ];
};

Topic.prototype.computed_tags = function( persona ){
  var buf = [];
  var voted = false;
  if( persona ){
    if( Vote.find( persona.name + "." + this.name ) ){
      buf.push( "#vote" );
      voted = true;
    }
  }
  if( this.is_tag() ){
    buf.push( '#tag' );
  }
  if( Persona.find( "@" + this.label )
  || Persona.find( "@" + this.label.substring( 1 ) )
  ){
    buf.push( "#persona" );
  }
  if( persona && !voted ){
    buf.push( "#new" );
  }
  if( this.age() <= Kudo.ONE_WEEK ){
    buf.push( "#recent" );
    if( this.result.total() === 1
    ||  this.result.is_referendum()
    ){
      buf.push( "#hot" );
    }
    if( this.age() <= Kudo.ONE_DAY ){
      buf.push( "#today" );
    }else if( this.age() <= 2 * Kudo.ONE_DAY ){
      buf.push( "#yesterday" );
    }
  }
  if( this.expire() < Kudo.now() + Kudo.ONE_WEEK ){
    buf.push( "#fade" );
  }

  if( this.result.is_win() ){
    buf.push( "#win" );
  }else if( this.result.is_tie() ){
    buf.push( "#tie" );
  }else if( this.result.is_abuse() ){
    buf.push( "#abuse" );
  }
  if( this.result.orientation() === "blank" ){
    buf.push( "#blank" );
  }

  // #protest if protest votes > 1% of agree votes
  if( this.result.is_problematic() ){
    buf.push( "#protest" );
  }
  // #orphan if no votes after a week
  if( this.result.total() <= 1 && this.age() > Kudo.ONE_WEEK ){
    buf.push( "#orphan" );
  // #referendum if 1% of people voted (at least 2!)
  }else if( this.result.is_referendum() && !voted ){
    buf.push( "#referendum" );
  }
  // ToDo: #hot, not an easy one
  if( !buf.length )return "";
  return " " + buf.join( " " );
};


Topic.prototype.expiration = function(){
// At expiration, topic is simply renewed, unless no votes remains
// ToDo: handle topic burial
  if( this.result && this.result.total() ){
    de&&bug( "Pre-expiration for " + this );
    this.resurrect();
    this.renew();
  }else{
    de&&bug( "Expiration for " + this );
    Topic.super.prototype.expiration.call( this );
  }
  return this;
};


Topic.prototype.add_vote = function( v ){
  this.touch();
  this.log_vote( v );
  this.result.add_vote( v );
  return this;
};


Topic.prototype.remove_vote = function( was ){
// Called by vote.remove()
  //this.log_anti_vote( was );
  this.result.remove_vote( was );
};

Topic.prototype.log_vote = function( v ){
// Called by .add_vote()
// There is a log of all votes. It is a snapshot copy of the vote value that is
// kept because a persona's vote can change over time.
  var val = v.value();
  v.snapshot = val;
  val.snaptime = Kudo.now();
  val.comment_text = v.comment() && v.comment().text;
  val.entity = v;
  val.persona_label = v.persona.label;
  var votes_log = this.votes_log();
  if( !votes_log ){ votes_log = []; }
  votes_log.push( val );
  this.votes_log( votes_log );
  // Also log in global log
  Vote.log.push( val );
  return this;
};

Topic.prototype.log_anti_vote = function( was ){
// Called by remove_vote()
// When a vote is removed (erased), it is removed from the log of all the votes
// on the proposition.
  var votes_log = this.votes_log();
  // Look for the logged vote
  var found_idx;
  var ii = votes_log.length;
  while( ii-- ){
    if( votes_log[ ii ].entity.id === was.id ){
      found_idx = ii;
      break;
    }
  }
  // The vote must be there, ie log_vote() was called before
  de&&mand( typeof found_idx !== "undefined" );
  // No clone, votes contains the valid votes, ie not the removed ones
  // ToDo: this is rather slow, maybe nullification would be better, with
  // some eventual compaction
  votes_log.splice( found_idx, 1 );
  this.votes_log( votes_log );
  return this;
};


Topic.prototype.add_tag = function( tag, loop ){
  var list = this.tags() || [];
  var idx = list.indexOf( tag );
  // Done if already there
  if( idx !== -1 )return this;
  // No clone, not needed
  var new_list = list;
  new_list.push( tag );
  this.tags( new_list );
  if( !loop ){
    tag.add_proposition( this, true );
    tag.update_votes();
  }
  return this;
};

Topic.prototype.remove_tag = function( tag, loop ){
  var list = this.tags() || [];
  var idx = list.indexOf( tag );
  // Done if already not there
  if( idx === -1 )return this;
  // No clone, not needed
  var new_list = list;
  de&&mand( idx !== - 1 );
  new_list.splice( idx, 1 );
  this.tags( new_list );
  if( !loop ){
    tag.remove_proposition( this, true );
    tag.update_votes();
  }
  return this;
};

Topic.prototype.add_comment = function( comment ){
  
  // Add to list of all comments on topic
  var list = this.comments() || [];
  var idx = list.indexOf( comment );
  // Done if already there
  if( idx !== -1 )return this;
  // No clone, not needed
  var new_list = list;
  new_list.push( comment );
  this.comments( new_list );
  
  // Also maybe update the "best" comment to describe the topic
  if( !this.comment() || comment.persona === this.comment().vote.persona ){
    
    // Update if comment from the same persona as the current comment
    this.comment( comment );
    
  }else{
    // Use comment if first comment after a long inactivity
    var ok = false;
    var votes_log = this.votes_log();
    var last_vote = votes_log.length ? votes_log[ votes_log.length -1 ] : null;
    var ante_last_vote = !last_vote || votes_log.length < 2
    ? last_vote 
    : votes_log[ votes_log.length - 2 ];
    // OK if no vote yet, probably just after creation
    if( !last_vote ){
      ok = true;
    // Ok if last vote > 1 month or last is recent after a one month void
    }else{
      var age = Kudo.now() - last_vote.snaptime;
      if( age > Kudo.ONE_MONTH ){
        ok = true;
      }else if( age < Kudo.ONE_HOUR ){
        if( ante_last_vote ){
          age = Kudo.now() - ante_last_vote.snaptime;
          if( age > Kudo.ONE_MONTH ){
            ok = true;
          }
        }else{
          ok = true;
        }
      }
    }
    if( ok ){
      this.comment( comment );
    }
  }
  return this;
};

Topic.prototype.remove_comment = function( comment ){
  var list = this.tags() || [];
  var idx = list.indexOf( comment );
  // Done if already not there
  if( idx === -1 )return this;
  // ToDo: avoid clone?
  var new_list = list;
  de&&mand( idx !== - 1 );
  new_list.splice( idx, 1 );
  this.comments( new_list );
  return this;
};


Topic.prototype.add_proposition = function( proposition, loop ){
// Each tag has a list of all the propositions that are tagged with it
  var list = this.propositions() || [];
  // Done if already there
  if( list.indexOf( proposition ) !== - 1 )return this;
  // ToDo: avoid clone?
  var new_list = list.slice();
  new_list.push( proposition );
  this.propositions( new_list );
  if( !loop ){
    proposition.add_tag( this, true );
    this.update_votes();
  }
  return this;
};

Topic.prototype.remove_proposition = function( proposition, loop ){
  var list = this.propositions()|| [];
  var idx = list.indexOf( proposition );
  // Done if already not there
  if( idx === -1 )return this;
  // ToDo: avoid clone
  var new_list = list;
  de&&mand( idx !== - 1 );
  new_list.splice( idx, 1 );
  this.propositions( new_list );
  if( !loop ){
    proposition.remove_tag( this, true );
    this.update_votes();
  }
  return this;
};


Topic.prototype.filtered = function( filter, persona ){
// True if proposition pass thru the filter, ie proposition not filtered out

  if( this.expired() )return false;

  // If not filter, all pass, but abuses
  if( !filter ){
    return !this.result.is_abuse();
  }
  // Abuses don't pass, unless filter explicitly accept them
  if( this.result.is_abuse() ){
    if( filter.indexOf( "#abuse" ) === -1 )return false;
  }

  // OK, let's check the tags
  return this.is_tagged( filter, persona );
}

Topic.prototype.is_tagged = function( tags, persona ){
// Returns true if a topic includes all the specified tags
// Note: #something always includes itself, ie proposition xxx is #xxx tagged
  if( typeof tags === "string" ){
    return string_tags_includes( this.tags_string( persona ), tags );
  }
  return tags_includes( this.tags() || [], tags, this.label );
};

Topic.prototype.tags_string = function( persona ){
  var topic_tags_str = this.is_tag() ? [ this.label ] : [ "#" + this.label ];
  var topic_tags = this.tags() || [];
  topic_tags = topic_tags
  .sort( function( a, b ){
    return a.heat() - b.heat()
  })
  .forEach( function( tag ){
    topic_tags_str.push( tag.label );
  });
  return topic_tags_str.join( " " ) + this.computed_tags( persona );
};

function string_tags_includes( tags, other_tags ){
// Search uses filters that check if element matches specified tags
  // #but pseudo tag inverses the tag, ie #all #recent means all but recent
  var with_but = false;
  tags       = " " + tags.toLowerCase().trim() + " ";
  other_tags = " " + other_tags.toLowerCase().trim() + " ";
  if( tags.length < other_tags.length )return false;
  return other_tags.split( " " ).every( function( tag ){
    if( !tag )return true;
    if( tag === "#but" ){
      with_but = true;
      return true;
    }else if( tag === "#all" ){
      with_but = false;
    }
    var tag_is_there = tags.indexOf( tag  ) !== -1;
    if( with_but ){
      return !tag_is_there;
    }else{
      return tag_is_there;
    }
  });
}

function tags_includes( tags, other_tags, misc ){
// Checks that all the other tags are also inside the tags set
// [] does not include [ #a ]
// [ #a, #b, #c ] does include [ #a, #b ]
// [ #a, #b ] does not include [ #a, #c ]
  if( tags.length < other_tags.length )return false;
  for( var tag in other_tags ){
    if( tags.indexOf( other_tags[ tag ] ) === -1 ){
      // When an other tag is not found, enable the proposition to tag itself
      if( !misc
      || ( other_tags[ tag ].name !== misc
        && other_tags[ tag ].name !== '#' + misc )
      )return false;
    }
  }
  return true;
}

Topic.prototype.add_delegation = function( delegation, loop ){
// Each tag has a list of all the delegations that involve it
  var delegations = this.delegations() || [];
  if( delegations.indexOf( delegation ) === -1 ){
    delegations.push( delegation );
    this.delegations( delegations );
  }
  if( !loop ){
    delegation.add_tag( this, true );
  }
  return this;
};

Topic.prototype.update_votes = function(){
  // Something changed, this may have an impact on delegated votes
  var delegations = this.delegations() || [];
  delegations.forEach( function( delegation ){
    // ToDo: hum... complex!
    trace( "ToDo: handle delegation " + delegation + " in update_votes()" );
    delegation.update_votes();
  });
  return this;
};


/*
 *  Tagging event (or detagging)
 *
 *  This event is created typically when some UI changes the tags for a
 *  proposition/topic.
 *  Potential huge side effects...
 *  Only the owner of the proposition is supposed to have such a power!
 *  Specially when tags are removed.
 *  It is expected that the owner may change tags in order to favor the
 *  the proposition, by using tags that brings lots of positive votes but are
 *  either too general or not well related to the topic at hand. Voters can
 *  fight abusive tagging using Vote.protest.
 *
 *  ToDo: this should be an Action, not an Event
 *
 *  Attributes
 *    - proposition -- the proposition being tagged 
 *    - tags        -- additional tags
 *    - detags      -- removed tags
 *    - persona     -- optional author of the tagging, null if system origin
 */

Event.type( Tagging );
function Tagging( options ){
  de&&mand( options.proposition );
  this.proposition = options.proposition;
  // Tags/Detags are either #str or Tag entities, this gets normalized
  this.tags        = options.tags   || [];
  this.detags      = options.detags || [];
  this.persona     = options.persona;
  var that = this;
  // Remove tags first, this will restrict the delegations that apply
  var detag_entities = [];
  this.detags.forEach( function( tag ){
    de&&mand( tag.substring( 0, 1 ) === '#' );
    var tag_entity = ( tag.is_entity && tag ) || Topic.find( tag );
    if( !tag_entity ){
      trace( "Cannot detag, inexistent tag " + tag );
    }else{
      if( detag_entities.indexOf( tag_entity ) === -1 ){
        detag_entities.push( tag_entity );
        that.proposition.remove_tag( tag_entity );
      }
    }
  });
  // Then add tags, this will expand the delegations that apply
  var tag_entities = [];
  this.tags.forEach( function( tag ){
    var tag_entity = ( tag.is_entity && tag ) || Topic.find(  tag );
    if( !tag_entity ){
      trace( "On the fly creation of first seen tag " + tag );
      de&&mand( tag[0] === "#" );
      tag_entity = Topic.create( { label: tag } );
    }
    if( tag_entities.indexOf( tag_entity ) === -1 ){
      tag_entities.push( tag_entity );
      that.proposition.add_tag( tag_entity );
    }
  });
  // Normalizes, keep entities only, no strings, no duplicates
  this.detags = tag_entities;
  this.tags   = tag_entities;
}


/*
 *   Comment entity
 *
 *   Personas can leave comments to explain things about their vote.
 */

Event.type( Comment );
function Comment( options ){

  de&&mand( options.vote );
  de&&mand( options.text );

  // ToDo: fix this, should be the true object
  if( options.vote !== Vote.find( options.vote.key ) ){
    trace( "BUG! this should not happen..." );
    options.vote = Vote.find( options.vote.key );
  }
  this.vote = options.vote;
  this.text = options.text;
  this.vote.set_comment( this );
  this.vote.proposition.add_comment( this );

}


Comment.prototype.expiration = function(){
  if( this.vote.comment() === this ){
    this.vote.comment( null );
  }
  this.topic.remove_comment( this );
}


/*
 *  Vote entity
 *
 *  Personas can vote on propositions. They can change their mind.
 *  A group votes when the consolidated orientation of the group changes.
 *  Vote is either "direct" or "indirect" with a delegation.
 *  Analysts can vote on behalf of personas, based on some public source.
 *  ToDo: analysts should be able to vote on behalf of personas only for
 *  some topics, based on tags.
 */
 
Ephemeral.type( Vote );
function Vote( options ){

  // Decide: is it a new entity or an update? key is @persona_id.proposition_id
  var key = options.id_key ||( "" + options.persona.id + "." + options.proposition.id );
  this.identity( key );
  var vote = this.register( key );

  var persona      = options.persona     || vote.persona;
  var proposition  = options.proposition || vote.proposition;
  var orientation  = options.orientation

  de&&mand( persona     );
  de&&mand( proposition );

  this.persona     = persona;
  this.label       = options.label || (persona.label + "/" + orientation );
  this.proposition = proposition;

  if( this.is_create() ){
    this.analyst     = water( options.analyst );
    this.source      = water( options.source );
    this.comment     = water( options.comment );
    this.delegation  = water( options.delegation  || Vote.direct  );
    // Analysts vote "in the open", no privacy ; otherwise defaults to private
    this.privacy     = water( (options.analyst && Vote.public )
      || options.privacy || Vote.public
    );
    this.snapshot = null; // See Topic.log_vote() & Topic.set_comment()
    this.previously  = water( options.previously  || Vote.neutral );
    this.orientation = water();
    var w = water( _, error_traced( update ), [ this.delegation, this.orientation ] );
    w.vote = this;
    this.persona.track_vote( this );
    this.orientation( orientation );
  }else{
    !vote.buried && vote.update( this, options );
  }
  return vote;
  
  // Trigger on orientation or delegation change
  function update(){
    var vote = water.current.vote;
    if( vote.expired() )return;
    try{
      if( vote.was
      &&  vote.was.orientation === vote.orientation()
      &&  vote.was.delegation  === vote.delegation()
      ){
        // No changes
        trace( "BUG? useless update of vote " + vote );
        return;
      }
      // Orientation or delegation changed
      if( vote.was ){ vote.remove( vote.was ); }
      if( !options.label ){
        vote.label = vote.persona.label + "/" + vote.orientation();
      }
      vote.add();
      // Push updated entity
      vote.push();
      // Handle delegated votes
      //water.effect( function(){
        vote.persona.vote_for_others( vote );
      //});
    }catch( err ){
      trace( "Could not process vote " + vote, err, err.stack );
      console.trace( err );
      de&&bugger();
    }
  }
}


// Vote orientations
Vote.indirect = "indirect";
Vote.neutral  = "neutral";
Vote.agree    = "agree";
Vote.disagree = "disagree";
Vote.protest  = "protest";
Vote.blank    = "blank";

// Vote delegation, "direct" or indirect via agent
Vote.direct = "direct";

// Vote privacy
Vote.public  = "public";
Vote.secret  = "secret";
Vote.private = "private";

// Log a snapshot of all votes
Vote.log = [];

Vote.prototype.touch = function(){
  //this.time_touched = Kudo.now();
  Vote.super.prototype.touch.call( this );
}

Vote.prototype.is_direct = function(){
  return this.delegation() === Vote.direct;
};

Vote.prototype.is_indirect = function(){
  return !this.is_direct();
};

Vote.prototype.is_public = function(){
  return this.privacy() === Vote.public;
};

Vote.prototype.is_secret = function(){
  return this.privacy() === Vote.secret;
};

Vote.prototype.is_private = function(){
  return this.privacy() === Vote.private;
};

Vote.prototype.filtered = function( filter, persona ){
  if( this.expired )return false;
  return this.proposition.filtered( filter, persona || this.persona );
}

Vote.prototype.update = function( other, options ){
  this.duration(    other.duration    = options.duration    );
  this.analyst(     other.analyst     = options.analyst     );
  this.source(      other.source      = options.source      );
  this.previously(  other.previously  = options.previously  );
  this.privacy(     other.privacy     = options.privacy     );
  // Don't delegate vote if a direct non neutral vote exists
  if( (options.delegation && options.delegations !== Vote.direct )
    && this.delegation() === Vote.direct
    && this.orientation() !== Vote.neutral
  ){
    de&&bug( "Not delegated, direct vote rules" );
    return this;
  }
  this.delegation(  other.delegation  = options.delegation || Vote.direct );
  this.orientation( other.orientation = options.orientation );
  return this;
};

Vote.prototype.expiration = function(){
// At expiration vote becomes private direct neutral for a while
  if( this.orientation && !this.is_neutral() ){
    de&&bug( "Pre-expiration for " + this );
    this.resurrect();
    this.renew();
    Vote.create({
      id_key: this.id,
      orientation: Vote.neutral,
      delegation:  Vote.direct,
      privacy:     Vote.private
    });
  }else{
    de&&bug( "Expiration for " + this );
    Vote.super.prototype.expiration.call( this );
  }
  return this;
};


Vote.prototype.is_neutral = function(){
  return this.orientation() === Vote.neutral;
};


Vote.prototype.filtered = function( filter, persona ){
  if( this.expired() )return false;
  if( this.persona.expired() )return false;
  return this.proposition.filtered( filter, persona || this.persona );
}


Vote.prototype.add = function(){
  if( this.orientation() === Vote.neutral ){
    // Direct neutral vote enables delegated votes
    if( this.delegation() === Vote.direct ){
      this.delegate();
      if( this.delegation() !== Vote.direct ){
        return this;
      }
    }else{
      return this;
    }
  }
  var vote = this;
  // Votes of groups have no impacts on results
  if( vote.persona.is_group() )return this;
  de&&mand( this.proposition );
  de&&bug( "Add vote " + vote
    + " now " + vote.orientation()
    + " of " + vote.persona
    + " via " + vote.delegation()
    + " for proposition " + vote.proposition
  );
  // Keep persona alive
  if( vote.delegation() === Vote.direct ){
    vote.persona.touch();
  }
  vote.proposition.add_vote( vote );
  return this;
};

Vote.prototype.remove = function( was ){
  //debugger;
  de&&mand( !was.is_entity );
  this.previously( was.orientation );
  if( was.orientation === Vote.neutral )return this;
  var vote = this;
  // Votes of groups have no impacts on results
  if( vote.persona.is_group() )return this;
  de&&bug( "Remove vote " + vote
    + " previously " + was.orientation
    + " of " + vote.persona
    + " via " + was.delegation
    + " from proposition " + vote.proposition
  );
  //de&&bugger();
  vote.proposition.remove_vote( was );
return this;
};

Vote.prototype.delegate = function(){
// Direct neutral vote triggers delegations
  //de&&mand( this.orientation() === Vote.neutral );
  de&&mand( this.delegation()  === Vote.direct  );
  var delegations = this.find_applicable_delegations();
  if( !delegations.length )return this;
  // If multiple delegations apply, select the most recently touched active one
  // ToDo:
  var recent_delegation = null;
  delegations.forEach( function( delegation ){
    if( !recent_delegation
    || delegation.age_touched() < recent_delegation.age_touched()
    ){
      recent_delegation = delegation;
    }
  });
  return this.delegate_using( recent_delegation );
};

Vote.prototype.find_applicable_delegations = function(){
  return this.persona.find_applicable_delegations( this.proposition );
};

Vote.prototype.delegate_using = function( delegation ){
  var agent = delegation.agent;
  var agent_vote = agent.get_vote_on( this.proposition );
  if( !agent_vote )return this;
  var agent_orientation = agent_vote.orientation();
  if( agent_orientation === Vote.neutral )return this;
  de&&bug( "Delegated vote by " + agent
      + " on behalf of " + this.persona
      + " for proposition: " + this.proposition
      + ", orientation: " + agent_orientation
  );
  var vote = Vote.create({
    persona:     delegation.persona,
    delegation:  delegation,
    proposition: this.proposition,
    orientation: agent_orientation
  });
  delegation.track_vote( vote );
  return this;
};

Vote.prototype.set_comment = function( comment ){
  if( comment ){
    this.touch();
  }
  this.comment( comment );
  // Comments can occur after vote's value was logged, see Topic.log_vote()
  this.snapshot.comment_text = comment.text;;
  return this;
}


/*
 *  Result (of votes on a topic)
 */

Effect.type( Result );
function Result( options ){
  
  de&&mand( options.proposition );
  
  var result = this.register( "" + options.proposition.id );
  var water  = this.water( result );

  this.touch();
  this.proposition = options.proposition;
  this.label       = this.proposition.label;
  this.neutral     = water( options.neutral   || 0 ); // ToDo: remove this?
  this.blank       = water( options.blank     || 0 );
  this.protest     = water( options.protest   || 0 );
  this.agree       = water( options.agree     || 0 );
  this.disagree    = water( options.disagree  || 0 );
  this.direct      = water( options.direct    || 0 );
  this.secret      = water( options.secret    || 0 );
  this.private     = water( options.private   || 0 ),
  this.count       = water( 0 );

  // If this is an update, it simply supersedes the so far known result.
  // This is handy to import bulk results from an external system or to
  // compact the persistent log of changes.
  if( this.is_update() ){
    result.neutral(  this.neutral  );
    result.blank(    this.blank    );
    result.protest(  this.protest  );
    result.agree(    this.agree    );
    result.disagree( this.disagree );
    result.direct(   this.direct   );
    result.secret(   this.secret   );
    result.private(  this.private  );
    result.count(    this.count    );
    return result;
  }
  
  // Computed attributes, including orientation transition detection
  
  this.total = function(){
    this.count( this.count() + 1 );
    var old = this.total();
    var r = this.neutral()
    + this.blank()
    + this.protest()
    + this.agree()
    + this.disagree();
    de&&bug( "  Total for " + this, "is:", r, "was:", old,
      "direct:", this.direct()
    );
    return r;
  }.when( this.neutral, this.blank, this.protest, this.agree, this.disagree );
  this.total( 0 );
  de && ( this.total.label = "total" );
  
  this.against = function(){
    var old = this.against();
    var r = this.disagree() + this.protest();
    de&&bug( "  Against about " + this, "is:", r, "was:", old );
    return r;
  }.when( this.disagree, this.protest );
  this.against( 0 );
  de && ( this.against.label = "against" );
  
  this.win = function(){
    var old = this.win();
    var r = this.agree() > this.against();
    de&&bug( "  Win about " + this, "is:", r, "was:", old );
    return r;
  }.when( this.agree, this.against );
  this.win( false );
  de && ( this.win.label = "win" );
  
  this.orientation = function(){
    var old = this.orientation() || Vote.neutral;
    var now;
    //if( this.proposition.id === 10017 )de&&bugger();
    de&&bug( "  Computing orientation for " + this,
      "expired:", this.expired(),
      "agree:",   this.agree(),
      "against:", this.against(),
      "protest:", this.protest(),
      "blank:",   this.blank()
    );
    if( this.expired() ){
      now = Vote.neutral;
    }else if( this.agree() > this.against() ){
      // Won
      if( this.agree() > this.blank() ){
        // agree > blank, > against
        now = Vote.agree;
      }else{
        // blank > agree, > against
        now = Vote.blank;
      }
    }else{
      // Lost
      if( this.disagree() > this.neutral() ){
        if( this.disagree() > this.blank() ){
          if( this.disagree() > this.protest() ){
            now = Vote.disagree;
          }else{
            now = Vote.protest;
          }
        }else{
          if( this.blank() > this.protest() ){
            now = Vote.blank;
          }else{
            now = Vote.protest;
          }
        }
      }else{
        if( this.disagree() > this.blank() ){
          if( this.disagree() > this.protest() ){
            now = Vote.disagree;
          }else{
            now = Vote.protest;
          }
        }else{
          if( this.blank() > this.protest() ){
            now = Vote.blank;
          }else{
            now = this.protest() ? Vote.protest : Vote.neutral;
          }
        }
      }
    }
    de&&bug( "  Computed orientation " + this, "was:", old, "is:", now ); //, value( this, true ) );
    if( now !== old ){
      de&&bug( "  Change of orientation, create a transition" );
      //debugger;
      Transition.create({ result: this, orientation: now, previously: old });
      return now;
    }
    // Else don't produce a new value
    return _;
  }.when( this.agree, this.against, this.blank );

  this.orientation( Vote.neutral );
  de && ( this.orientation.label = "orientation" );

  return this;
}

Result.prototype.touch = function(){
  this.time_touched = Kudo.now();
}

Result.prototype.is_tie = function(){
  return this.agree() === this.against();
}

Result.prototype.is_win = function(){
  return this.win();
}

Result.prototype.is_abuse = function(){
  return this.orientation() === Vote.protest;
}

Result.prototype.is_referendum = function(){
  return this.total() * 100 > Persona.count && this.total() > 1;
}

Result.prototype.is_problematic = function(){
// A proposition is problematic if the number of protest votes exceeds 1%
// of the number of agree votes.
  return this.protest() * 100 > this.agree();
}

Result.prototype.add_vote = function( vote ){
// Called by topic.add_vote()
  de&&mand( vote.proposition === this.proposition );
  // Neutral votes have no more impacts
  if( vote.orientation() === Vote.neutral )return this;
  this[ vote.orientation() ]( this[ vote.orientation() ]() + 1 );
  if( vote.delegation() === Vote.direct ){
    this.direct( this.direct() + 1 );
  }
  return this;
};

Result.prototype.remove_vote = function( was ){
// Called by topic.remove_vote()
  de&&mand( was.proposition === this.proposition.id );
  // Nothing was done when neutral vote was added, nothing needed now either
  if( was.orientation === Vote.neutral )return this;
  var old_o = this[ was.orientation ]();
  de&&mand( old_o > 0 );
  this[ was.orientation ]( old_o - 1 );
  if( was.delegation === Vote.direct ){
    var old_d = this.direct();
    de&&mand( old_d > 0 );
    this.direct( old_d - 1 );
  }
  return this;
};


/*
 *  Transition event entity.
 *
 *  A transition is the event that occurs when the consolidated orientation
 *  changes on a topic.
 */
 
Event.type( Transition );
function Transition( options ){
  de&&mand( options.result );
  de&&mand( options.orientation );
  de&&mand( options.previously );
  this.result      = options.result;
  this.orientation = options.orientation;
  this.previously  = options.previously;
}


/*
 *  Delegation entity.
 *
 *  It describes how a persona's vote is delegated to another persona.
 *  A delegation involves a filter that detects the involved topics. That
 *  filter is a list of tags, with an "and" logic. A proposition tagged with
 *  all the tags in that list will pass the filter and be voted on by the
 *  designated agent persona.
 *  Because delegations are transitive, if an agent delegates to another
 *  agent that delegates to the first agent, directly or indirectly, then there
 *  is a "delegation loop". In such case, the delegation cannot be activated.
 *
 *  ToDo: consolidate all delegations to the same agent into a single
 *  delegation with multiple filters.
 *  ToDo: better, create votable delegation templates. Then persona can
 *  have a list of templates instead of a list of filters.
 *  The template should provide a default agent,
 */

Ephemeral.type( Delegation );
function Delegation( options ){
  
  de&&mand( options.persona || options.id_key );
  de&&mand( options.agent   || options.id_key );
  de&&mand( options.tags    || options.id_key );
  de&&mand( ( options.tags && options.tags.length > 0 ) || options.id_key );

  var key = options.id_key
  || ( "" + options.persona.id + "." + options.agent.id + "." + options.tags[0].label );
  this.identity( key );
  var delegation = this.register( key );
  var water      = this.water( delegation );

  var persona   = options.persona || delegation.persona;
  var agent     = options.agent   || delegation.agent;
  de&&mand( persona );
  de&&mand( agent   );

  // Delegation are transitive, there is a risk of loops
  if( !options.inactive
  && agent.delegates_to( persona, options.tags || delegation.tags )
  ){
    trace( "Loop detected for delegation " + pretty( options ) );
    // ToDo: should provide a "reason" to explain the deactivation
    options.inactive = true;
  }

  this.persona  = persona;
  this.agent    = agent;
  this.label    = agent.label;
  this.votes    = water( [] ); // Votes done because of the delegation
  this.privacy  = water( options.privacy );
  this.tags     = water( [] );
  this.inactive = water();

  if( this.is_update() ){
    delegation.privacy( this.privacy );
    // If change to list of tags
    if( options.tags && diff( options.tags, delegation.tags() ).changes ){
      this.inactive = options.inactive || delegation.inactive();
      // Deactivate delegated votes
      delegation.inactive( true );
      delegation.tags( options.tags );
      // Activate delegated votes
      // ToDo: is water.effect() needed?
      if( !this.inactive ){
        Kudo.water.effect( function(){ delegation.inactive( false ); } );
      }
      return delegation;
    }
    // If change to activation flag only
    delegation.inactive( this.inactive );
    return delegation;
  }

  this.previous_tags = null;
  this.was_inactive  = true;
  var w = water( _,  error_traced( update ), [ this.inactive, this.tags ] );
  w.delegation = this;

  // Fire initial update
  this.privacy( options.privacy || Vote.public );
  this.inactive( true );
  this.tags( options.tags );
  water.effect( function(){
    delegation.inactive( !!options.inactive );
  });
  this.persona.add_delegation( this );
  return this;

  function update(){
    //debugger;
    var delegation  = water.current.delegation;
    var delta       = diff( delegation.previous_tags, delegation.tags() );
    var inactive    = delegation.inactive();
    var need_update = false;
    // If change in activation
    if( inactive !== delegation.was_inactive ){
      need_update = true;
      delegation.was_inactive = inactive;
      // Delegation became active
      if( !inactive ){
        trace( "Activate delegation" );
        // Refuse to activate a delegation that loops
        if( delegation.agent.delegates_to( delegation.persona, delta.now ) ){
          trace( "Looping delegation is deactivated ", pretty( delegation ) );
          // ToDo: provide some explanation about why activation was refused
          delegation.inactive( true );
        }
        // Delegation becomes inactive
      }else{
        de&&bug( "ToDo: deactivate a delegation" );
      }
    }
    // If changes in tags
    if( delta.changes ){
      // Before such changes, delegation was deactivated
      de&&mand( inactive );
      need_update = true;
      delegation.previous_tags = delta.now;
      var added    = delta.added;
      var removed  = delta.removed;
      var kept     = delta.kept;
      // If totally different sets
      if( !kept.length ){
        removed.forEach( function( tag ){
          de&&bug( "ToDo: handle removed tag " + tag + " for fresh delegation " + delegation );

        });
        added.forEach( function( tag ){
          de&&bug( "Add tag " + tag + " for fresh delegation " + delegation );
          tag.add_delegation( delegation, true );
          // true => don't add tag back to delegation, it's being done here
        });
      // If sets with some commonality
      }else{
        removed.forEach( function( tag ){
          de&&bug( "ToDo: handle removed tag " + tag + " for delegation " + delegation );

        });
        added.forEach( function( tag ){
          de&&bug( "ToDo: handle added tag " + tag + " for delegation " + delegation );

        });
      }
    }
    // Update existing votes and make new delegated votes
    if( need_update ){
      delegation.update_votes();
    }
  }
}

Delegation.prototype.is_active = function(){
  return !this.inactive();
};

Delegation.prototype.is_inactive = function(){
  return !this.is_active();
};

Delegation.prototype.is_public = function(){
  return this.privacy() === Vote.public;
};

Delegation.prototype.is_secret = function(){
  return this.privacy() === Vote.secret;
};

Delegation.prototype.is_private = function(){
  return this.privacy() === Vote.private;
};

Delegation.prototype.filter_string = function( persona ){
  var buf = [];
  this.tags().forEach( function( tag ){
    buf.push( tag.label );
  });
  return buf.join( " " );
};

Delegation.prototype.heat = function(){
// Compute the "heat" of a delegation. "Hot delegations" should come first.
  var touched = this.time_touched;
  // Recently touched are hot
  var age = Kudo.now() - touched;
  if( age < Kudo.ONE_MINUTE )return touched;
  if( age < Kudo.ONE_HOUR   )return touched;
  // Less recently touched delegations are hot depending on number of votes
  return this.votes().length;
};


Delegation.prototype.filtered = function( filter, persona ){

  if( this.expired( ) )return false;
  if( this.agent.expired() )return false;
  if( !filter )return true;
  return this.is_tagged( filter, persona );
}


Delegation.prototype.is_tagged = function( tags, persona ){
// Returns true if a delegation includes all the specified tags
// Note: #something always includes itself, ie proposition xxx is #xxx tagged
  if( typeof tags === "string" ){
    return string_tags_includes( this.tags_string( persona ), tags );
  }
  return tags_includes( this.tags() || [], tags, this.agent.label.substring( 1 ) );
};

Delegation.prototype.tags_string = function( persona ){
  var tags_str = [ "#" + this.agent.label.substring( 1 ) ];
  var tags = this.tags() || [];
  tags
  .sort( function( a, b ){
    return a.heat() - b.heat()
  })
  .forEach( function( tag ){
    tags_str.push( tag.label );
  });
  return tags_str.join( " " ); // + this.computed_tags();
};

Delegation.prototype.update_votes = function(){
  var delegation = this;
  var tags     = delegation.tags();
  var inactive = delegation.inactive();
  var votes = delegation.votes() || [];
  votes.forEach( function( vote ){
    // Check that vote is still delegated as it was when last updated
    if( vote.delegation() !== delegation )return;
    // Does the delegation still include the voted proposition?
    var included = delegation.includes_proposition( vote.proposition );
    // If tags changed (now excludes the proposition) or agent's mind change
    var new_orientation = !inactive && included
      ? delegation.agent.get_orientation_on( vote.proposition )
      : Vote.neutral;
    if( new_orientation && new_orientation !== vote.orientation() ){
      // If vote becomes neutral, maybe another delegation thinks otherwise?
      if( false && new_orientation === Vote.neutral && !included ){
        vote.delegate();
        // If no other agent, true neutral
        if( vote.delegation() === delegation ){
          Vote.create({
            persona: vote.persona,
            delegation: Vote.direct,
            proposition: vote.proposition,
            orientation: Vote.neutral
          });
        }
      }else{
        Vote.create({
          persona: vote.persona,
          delegation: Vote.direct,
          proposition: vote.proposition,
          orientation: new_orientation
        });
      }
    }
  });
  // Discover new delegated votes for tagged propositions
  delegation.vote_on_tags( tags, inactive );
  return this;
};

Delegation.prototype.vote_on_tags = function( tags, inactive ){
  var delegation = this;
  if( inactive )return this;
  var candidate_propositions;
  // Sort tags by increasing number of topics, it speeds up the 'and' logic
  var sorted_tags = tags.slice();
  sorted_tags.sort( function( a, b ){
    return a.propositions().length - b.propositions().length; }
  );
  sorted_tags.forEach( function( tag ){
    // Start with a set of topics, the smaller one
    if( !candidate_propositions ){
      candidate_propositions = tag.propositions().slice();
      // Keep topics that are also tagged with the other tags
    }else{
      var propositions = tag.propositions();
      candidate_propositions.forEach( function( proposition, idx ){
        // If a proposition is not tagged, flag it for removal
        if( propositions.indexOf( proposition ) === -1 ){
          candidate_propositions[ idx ] = null;
        }
      });
    }
  });
  // Collect kept propositions, they match the tags
  if( candidate_propositions ){
    var all_tagged_propositions = [];
    candidate_propositions.forEach( function( proposition ){
      if( proposition ){ all_tagged_propositions.push( proposition ); }
    });
    // Vote on these propositions, based on agent's orientation
    all_tagged_propositions.forEach( function( proposition ){
      var orientation = delegation.agent.get_orientation_on( proposition );
      if( orientation ){
        // Create a vote
        de&&bug( "New delegation implies vote of " + delegation.persona
            + " thru agent " + delegation.agent
            + ", orientation: " + orientation
        );
        Vote.create( {
          persona:     delegation.persona,
          delegation:  delegation,
          proposition: proposition,
          orientation: orientation
        });
      }
    });
  }
  return this;
};

Delegation.prototype.add_tag = function( tag, loop ){
  var tags = this.tags() || [];
  if( tags.indexOf( tag ) !== -1 )return this;
  var now = tags.slice();
  now.push( tag );
  this.tags( now );
  if( !loop ){
    tag.add_delegation( this, true );
  }
  return this;
};


Delegation.prototype.track_vote = function( vote ){
// Called when a persona vote is created due to the agent voting
  var votes = this.votes();
  if( votes.indexOf( vote ) !== -1 )return this;
  // Note: no clone for the array, not needed
  votes.push( vote );
  this.votes( votes );
  return this;
};


// At expiration, the delegation becomes inactive for a while
Delegation.prototype.expiration = function(){
  if( this.inactive && !this.inactive() ){
    this.resurrect();
    this.renew();
    this.inactive( true );
    this.push();
  }else{
    Delegation.super.prototype.expiration.call( this );
  }
  return this;
};

Delegation.prototype.includes_tags = function( tags ){
  return tags_includes( tags, this.tags() );
};

Delegation.prototype.includes_proposition = function( proposition ){
  return this.includes_tags( proposition.tags() );
};

Delegation.prototype.delegates_to = function( agent, tags, seen ){
  if( !seen ){ seen = {}; }
  if( seen[ this.agent.id ] ){
    trace( "Loop detected when looking for agent " + agent
    + " in delegation " + this + " of " + this.persona );
    return false;
  }
  seen[ this.id ] = true;
  if( this.includes_tags( tags ) ){
    if( this.agent === agent
    || this.agent.delegates_to( agent, tags, seen )
    ){
      return false;
    }
  }
  return true;
};


/*
 *  Membership entity.
 *
 *  They make personas members of group personas.
 */

Ephemeral.type( Membership );
function Membership( options ){
  
  de&&mand( options.member ); // a persona
  de&&mand( options.group  ); // a group persona typically
  de&&mand( options.group.is_group() );

  var key = "" + options.member.id + "." + options.group.id;
  this.identity( "&m." + key );
  var membership = this.register( key );

  if( this.is_create() ){
    this.member   = options.member;
    this.group    = options.group;
    this.member.add_membership( this );
    this.inactive = water();
    this.inactive.membership = this;
    this.inactive( _, update, [ !!options.inactive ] );
  }else{
    membership.inactive( !!options.inactive )
  }
  return membership;

  // ToDo: handle change in membership activation
  function update( is_inactive ){
    var old = water.current.current;
    if( old === is_inactive )return _;
    // Change
    if( !is_inactive ){
      // Activate
      de&&bug( "Activate membership" );
      water.current.membership.group.add_member( membership.member );
    }else{
      // Deactivate
      de&&bug( "Deactivate membership" );
      water.current.membership.group.remove_member( membership.member );
    }
    return is_inactive;
  }
  
}


Membership.prototype.expiration = function(){
// Handle expiration, first deactivate membership and then remove it
  if( this.inactive && !this.inactive() ){
    this.resurrect();
    this.renew();
    this.inactive( true );
  }else{
    Membership.super.prototype.expiration.call( this );
    this.member.remove_membership( this );
  }
  return this;
};

// Exports
// export = vote;


/* ========================================================================= *\
 * ======================== Vote front end processor ======================= *
\* ========================================================================= */


/*
 *  For UI
 */
 
Ephemeral.type( Visitor );
function Visitor( options ){
  this.persona     = options.persona;
  this.twitter     = options.twitter; // Twitter credentials
  this.actions     = Ephemeral.fluid();
}


/*
 *  Action entity.
 *  This is what a Visitor does. She needs an UI for that purpose.
 */

Ephemeral.type( Action );
function Action( options ){
  this.visitor     = options.visitor;
  this.verb        = options.verb;
  this.parameters  = options.parameters;
}


var replized_verbs = {};
var replized_verbs_help = {};

function bootstrap(){
// This function returns a list of functions that when called can use
// Ephemeral.inject() to inject changes into the machine. The next function
// in the list is called once all effects of the previous function are fully
// done.
// The bootstrap() function is used in the main() function using Ephemeral.
// start(). That latter function will call bootstrap() only when there is
// no log file of persisted changes.

  var debugging = true;

  function def( f, help ){
    replized_verbs[ f.name ] = f;
    replized_verbs_help[ f.name ] = help;
  }

  function c( t, p ){
    trace( "INJECT " + t.name + " " + pretty( p ) );
    return Ephemeral.ref( Ephemeral.inject( t.name, p ).id );
  }
  def( c, "type +opt1:v1 +opt2:v2 ... -- inject a Change" );

  function p( n ){
    return p[n] = c( Persona, { label: n } );
  }
  def( p, "@name -- create a person" );

  function g( n ){
    return p[n] = c( Persona, { label: n, role: "group" } );
  }
  def( g,"@name -- create a group" );

  function t( n, l ){
  // Create a proposition topic, tagged
    if( !Array.isArray( l ) ){
      l = [ l ];
    }
    return t[n] = c( Topic, { label: n, source: "bootstrap", tags: l } );
  }
  def( t, "name +#tag1 +#tag2 ... -- create proposition topic, tagged" );

  function tag( n ){
    return t[n] = c( Topic, { label: n } );
  }
  def( tag, "#name -- create a tag topic" );

  function tagging( p, d, t ){
    if( !Array.isArray( d ) ){
      d = [ d ];
    }
    if( !Array.isArray( t ) ){
      t = [ t ];
    }
    return c( Tagging, { proposition: p, detags: d, tags: t } );
  }
  def( tagging, "&proposition +#detag1 ... , +#tag1 ... -- create a tagging" );


  function v( p, t, o ){
  // Create/Update a vote
    de&&mand( p ); de&&mand( t );
    return v[ v.n++ ]
    = c( Vote, { persona: p, proposition: t, orientation: o } );
  }
  v.n = 0;
  def( v, "&persona &proposition orientation -- create/update a vote" );

  function d( p, t, a, i ){
    if( !Array.isArray( t ) ){
      t = [ t ];
    }
    return d[ d.n++ ] = c( Delegation,
      { persona: p, tags: t, agent: a } );
  }
  d.n = 0;
  def( d, "&persona +#tag1 ... &agent -- create/update a delegation" );

  function r( t, a, d, p, b, n, dir ){
  // Update a result
    return c( Result, { proposition: t,
      agree: a, disagree: d, protest: p, blank: b, neutral: n, direct: dir
    } );
  }

  function m( p, g, i ){
  // Create/Update a membership
    return c( Membership, { member: p, group: g, inactive: i } );
  }
  def( m, "&member &group +inactive:? -- create/update a membership" );

  for( var verb in replized_verbs ){
    http_repl_commands[ verb ] = replized_verbs[ verb ];
  }

  var entity;
  function e( type, key ){
  // Retrieve an entity by key. Usage: e( type, entity or type, key, ... )
  //   ex: e( Persona, "@jhr" )
  //   ex: e( Vote, Persona, "@jhr", Topic, "Hulot president" );
  //   ex: e( Vote, e( Persona, "@jhr"), Topic, "Hulot president" );
  //   ex: e( Vote, Persona, @jhr, e( Topic, "Hulot president" ) );
    if( arguments.length === 1 && type && type.is_entity )return entity = type;
    if( arguments.length === 2 ){
      entity = type.find( key );
      if( !entity ){
        debugger;
        type.find( key );
      }
      return entity;
    }
    var id = "";
    var ii = 1;
    while( ii < arguments.length ){
      if( arguments[ ii ].is_entity ){
        id += "." + arguments[ ii ].id;
        ii += 1;
      }else{
        id += "." + arguments[ ii ].find( arguments[ ii + 1 ] ).id;
        ii += 2;
      }
    }
    entity = type.find( id.substring( 1 ) );
    if( !entity ){
      debugger;
      type.fin( id.substring( 1 ) );
    }
    return entity;
  }

  // This bootstrap is also the test suite...., a() is assert()
  var test_description = "none";
  function a( prop, msg ){
    if( prop )return;
    trace( "DESCRIPTION: " + test_description );
    trace( "Test, error on entity " + pretty( entity, 2 ) );
    console.trace();
    !( de && debugging ) && assert( false, msg );
    de&&bugger;
  }

  var test_count = 0;
  var test_list  = [];
  function describe( text ){
    return function(){
      test_count++;
      test_description = text;
      test_list.push( text );
    }
  }

  function summary(){
    trace( "TEST SUMMARY\n" + test_list.join( "\n" ) );
    trace( "TESTS, " + test_count + " successes"                )
  }

  // Test entities
  var /* individuals */ kudocracy, jhr, hulot, peter;
  var /* groups */ g_hulot;
  var /* tags */ t_president, t_kudocracy;
  var /* propositions */ p_kudocracy, p_hulot;
  var /* votes */ v_jhr, v_peter, v_hulot;
  var /* Results */ r_hulot;

  trace( "Bootstrap - Kudocracy test suite" );
  return [

    //                          *** Personas ***

    describe( "Personas creation " ),
    function(){ p( "@kudocracy"                                             )},
    function(){ kudocracy = e( Persona, "@kudocracy"                        )},
    function(){ a( kudocracy, "persona @kudocracy exists"                   )},
    function(){ p( "@jhr"                                                   )},
    function(){ jhr = e( Persona, "@jhr"                                    )},
    function(){ p( "@john"                                                  )},
    function(){ p( "@luke"                                                  )},
    function(){ p( "@marc"                                                  )},
    function(){ p( "@peter"                                                 )},
    function(){ peter = e( Persona, "@peter"                                )},
    function(){ p( "@n_hulot"                                               )},
    function(){ hulot = e( Persona, "@n_hulot"                              )},

    //                          *** Groups ***

    describe( "Groups creation" ),
    function(){ g( "@Hulot_friends"                                         )},
    function(){ g_hulot = e( Persona, "@Hulot_friends"                      )},
    function(){ a( g_hulot.is_group() && !g_hulot.is_individual()           )},

    //                        *** Membership ***

    describe( "Membership creation" ),
    function(){ m( jhr, g_hulot                                             )},
    function(){ a(  jhr.is_member_of( g_hulot)                              )},
    function(){ a(  g_hulot.has_member( jhr )                               )},
    function(){ m( jhr, g_hulot, true /* inactive */                        )},
    function(){ a( !jhr.is_member_of( g_hulot )                             )},
    function(){ a( !g_hulot.has_member( jhr )                               )},
    function(){ m( jhr, g_hulot                                             )},
    function(){ a(  jhr.is_member_of( g_hulot)                              )},
    function(){ a(  g_hulot.has_member( jhr )                               )},

    //                          *** Tags ***

    describe( "Tags creation" ),
    function(){ tag( "#kudocracy"                                           )},
    function(){ t_kudocracy = e( Topic, "#kudocracy"                        )},
    function(){ tag( "#president"                                           )},
    function(){ t_president = e( Topic, "#president"                        )},
    function(){ a(  t_president, "Topic #president exists"                  )},
    function(){ a(  t_president.is_tag()                                    )},
    function(){ a( !t_president.is_proposition()                            )},


    //                     *** Propositions ***

    describe( "Propositions creation" ),
    function(){ t( "kudocracy", []                                          )},
    function(){ p_kudocracy = e( Topic, "kudocracy"                         )},
    function(){ t( "hollande_president",  [ t_president ]                   )},
    function(){ a( e( Topic, "hollande_president").is_proposition()         )},
    function(){ t( "hulot_president",     [ t_president ]                   )},
    function(){ p_hulot = e( Topic, "hulot_president"                       )},
    function(){ a( p_hulot.is_proposition()                                 )},
    function(){ a( r_hulot = p_hulot.result                                 )},

    //                     *** Delegations ***

    function(){ d( jhr, [ t_president ], hulot                              )},

    //                        *** Votes ***

    describe( "@kudocray wants kudocracy" ),
    describe( "Peter first disagrees, about the 'Hulot president' prop" ),
    function(){ v( peter, p_hulot, "disagree"                               )},
    function(){ v_peter = e( Vote, peter, p_hulot                           )},
    function(){ a( r_hulot.orientation() === "disagree"                     )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.disagree() === 1                                 )},
    function(){ a( r_hulot.against()  === 1                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Then Peter agrees" ),
    function(){ v( peter, p_hulot, "agree"                                  )},
    function(){ a( r_hulot.orientation() === "agree"                        )},
    function(){ a( r_hulot.win()                                            )},
    function(){ a( r_hulot.agree()    === 1                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Then Peter votes blank" ),
    function(){ v( peter, p_hulot, "blank"                                  )},
    function(){ a( r_hulot.orientation() === "blank"                        )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.blank()    === 1                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Then Peter protests" ),
    function(){ v( peter, p_hulot, "protest"                                )},
    function(){ a( r_hulot.orientation() === "protest"                      )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 1                                 )},
    function(){ a( r_hulot.blank()    === 0                                 )},
    function(){ a( r_hulot.protest()  === 1                                 )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Then Peters gets to neutral, equivalent to 'not voting'" ),
    function(){ v( peter, p_hulot, "neutral"                                )},
    function(){ a( r_hulot.orientation() === "neutral"                      )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.blank()    === 0                                 )},
    function(){ a( r_hulot.protest()  === 0                                 )},
    function(){ a( r_hulot.total()    === 0                                 )},
    function(){ a( r_hulot.direct()   === 0                                 )},

    describe( "Hulot votes, jhr too because of a delegation" ),
    function(){ v( hulot, p_hulot, "agree"                                  )},
    function(){ a( r_hulot.orientation() === "agree"                        )},
    function(){ a( r_hulot.win()                                            )},
    function(){ a( r_hulot.agree()    === 2                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Then Hulot gets to neutral" ),
    function(){ v( hulot, p_hulot, "neutral"                                )},
    function(){ a( r_hulot.orientation() === "neutral"                      )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.agree()    === 0                                 )},
    function(){ a( r_hulot.against()  === 0                                 )},
    function(){ a( r_hulot.blank()    === 0                                 )},
    function(){ a( r_hulot.protest()  === 0                                 )},
    function(){ a( r_hulot.total()    === 0                                 )},
    function(){ a( r_hulot.direct()   === 0                                 )},

    describe( "Hulot votes but jhr decides to vote directly" ),
    function(){ v( hulot, p_hulot, "agree"                                  )},
    function(){ a(  r_hulot.win()                                           )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},
    function(){ v( jhr, p_hulot, "disagree"                                 )},
    function(){ a( !r_hulot.win()                                           )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 2                                 )},

    describe( "Hulot votes but jhr decided to vote directly, respect" ),
    function(){ v( hulot, p_hulot, "blank"                                  )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.blank()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 2                                 )},

    describe( "jhr erases his vote and so relies again on his delegation"),
    function(){ v( jhr, p_hulot, "neutral"                                  )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.blank()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Detag p_hulot, so that jhr's delegation does not apply" ),
    function(){ tagging( p_hulot, [ "#president" ], []                      )},
    function(){ a( r_hulot.total()    === 1                                 )},
    function(){ a( r_hulot.blank()    === 1                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Restore that tag, jhr delegation applies" ),
    function(){ tagging( p_hulot, [], [ "#president" ]                      )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.blank()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    describe( "Hulot votes, agree count includes jhr's delegated vote" ),
    function(){ v( hulot, p_hulot, "agree"                                  )},
    function(){ a( r_hulot.total()    === 2                                 )},
    function(){ a( r_hulot.blank()    === 0                                 )},
    function(){ a( r_hulot.agree()    === 2                                 )},
    function(){ a( r_hulot.direct()   === 1                                 )},

    function(){ trace( "**************************************************" )},
    function(){ v( peter, p_hulot, "neutral"                                )},
    function(){ v( hulot, p_hulot, "disagree"                               )},
    function(){ v( peter, p_hulot, "agree"                                  )},
    //function(){ r( p_hulot, 102, 101, 1, 12, 1000, 99                       )},
    function(){ summary(                                                    )},

  function(){} ];
}


/* ---------------------------------------------------------------------------
 *  Dataflow processing. TBD
 *  Each fluid is fed whenever an entity is created or updated.
 *  The only valid action is to inject a change in the machine:
 *    Kudo.ephemeral.push( type, {...named parameters...} );
 *  That change gets logged in a persistent store and will be replayed whenever
 *  the machine is restarted.
 */

if( de ){
  Kudo.Persona    .fluid.pretty().log( "-->Log Persona"    );
  Kudo.Membership .fluid.pretty().log( "-->Log Membership" );
  Kudo.Source     .fluid.pretty().log( "-->Log Source"     );
  Kudo.Topic      .fluid.pretty().log( "-->Log Topic"      );
  Kudo.Delegation .fluid.pretty().log( "-->Log Delegation" );
  Kudo.Vote       .fluid.pretty().log( "-->Log Vote"       );
  Kudo.Result     .fluid.pretty().log( "-->Log Result"     );
  Kudo.Transition .fluid.pretty().log( "-->Log Transition" );
  Kudo.Visitor    .fluid.pretty().log( "-->Log Visitor"    );
  Kudo.Action     .fluid.pretty().log( "-->Log Action"     );
}
//Ephemeral.persist( "vote.trace.log", Trace.fluid );


/* ---------------------------------------------------------------------------
 *  Minimal HTTP session management
 *    Session is associated to source ip address.
 *    ToDo: use a cookie
 */


function Session( id ){
// Constructor, called by .login() only (except for default local session)
  // Return existing obj with same id
  var session = Session.all[ id ];
  if( session )return session;
  // Or init a new object
  this.id = id;
  this.clear();
  Session.all[ id ]  = this;
  return this;
}

Session.all = {};

Session.prototype.login = function( id ){
  if( id !== Session.current.id ){
    Session.current = new Session( id );
    return Session.current;
  }else{
    return this;
  }
}

Session.prototype.clear = function(){
  this.visitor       = null;
  this.filter        = "";
  this.filter_tags   = [];
  this.current_page  = [];
  this.previous_page = [];
  this.proposition   = null;
  return this;
}

Session.prototype.is_local = function(){
  return this.ip === "127.0.0.1";
}

Session.prototype.has_filter = function(){
  return !!this.filter.length;
}

Session.prototype.filter_tags_label = function(){
// Return , separated list of tags extracted from filter
  return this.filter.replace( / /g, "," ).replace( /#/g, "" )
}

Session.prototype.set_filter = function( text ){
  if( typeof text !== "string" )return;
  if( text ){

    var with_abuses = false;
    var tags = [];
    var tag_entity;
    var topic;

    // Sanitize, filter out weird stuff, keep valid tags for filtering
    this.filter = text.replace( /[^A-Za-z0-9_ ]/g, "" );
    if( this.filter === "all" ){
      this.filter = "";
    }else if( this.filter.length ){

      var buf = [];
      this.filter.split( " " ).forEach( function( tag ){

        if( tag.length <  2 && !Topic.reserved( tag ) )return;

        // Existing tags
        if( tag_entity = Topic.find( '#' + tag ) ){
          if( with_abuses || !tag_entity.result.is_abuse() ){
            buf.push( '#' + tag );
            tags.push( tag_entity );
          }

        // Computed tags
        }else if( Topic.reserved( tag ) ){
          buf.push( "#" + tag );
          if( tag === "abuse" ){
            with_abuses = true;
          }

        // Tags that are names of existing topics
        }else if( topic = Topic.find( tag ) ){
          if( with_abuses || !topic.result.is_abuse() ){
            buf.push( "#" + tag )
          }
        }

      });
      this.filter = buf.join( " " );
      this.filter_tags = tags;
    }
  }
  if( !this.filter ){
    this.fitler_tags = [];
  }
  return this.filter;
}

// Defaults to local session
Session.current = new Session( "127.0.0.1" );


/*
 *  The http REPL (Read, Eval, Print, Loop) is a very simple UI
 *  to test interactively the Vote engine.
 *
 *  The BASIC style verbs were first introduced in l8/test/input.coffee
 */

require( "l8/lib/queue" );
var http        = require( "http" );
var url         = require( "url" );
var querystring = require( "querystring" );

// IO tools. BASIC style

var screen    = [];

var cls = function(){
  screen = [];
  set_head( "" );
  set_body( "" );
};

var print     = function( msg ){
  ("" + msg).split( "\n" ).forEach( function( m ){ if( m ){ screen.push( m ); } } );
};

var printnl   = function( msg ){ print( msg ); print( "\n" ); };

var http_repl_head = "";
var set_head = function( x ){
  http_repl_head = x;
};

var http_repl_body = "";
var set_body = function( x ){
  http_repl_body = x;
};

var PendingResponse = null;
var respond = function( question ){
  if( !PendingResponse )return;
  if( PendingResponse.redirect ){
    PendingResponse.writeHead( 302, { Location: PendingResponse.redirect } );
    PendingResponse.end();
    PendingResponse = null;
    return;
  }
  PendingResponse.writeHead( 200, { 'Content-Type': 'text/html' } );
  var options = [];
  http_repl_history.forEach( function( item ){
    options.push( '<option value="' + item + '">' );
  });
  var head = http_repl_head;
  var body = http_repl_body;
  http_repl_head = http_repl_body = null;
  if( !body ){
    body = [
      '<div id="container" style="background-color: white;">',
      '<div class="content" id="content">',
      screen.join( "<br\>" ),
      '</div>',
      '<div id="footer">',
      '<form name="question" url="/" style="width:50%">',
      question,
      '<input type="text" name="input" placeholder="a command or help" autofocus list="history" style="width:99%">',
      '<datalist id="history">',
      options.join( "\n" ),
      '</datalist>',
      '<input type="submit">',
      link_to_command( "help" ),link_to_page( "index" ),
      '</form>',
      //'<script type="text/javascript" language="JavaScript">',
      //'document.question.input.focus();',
      //'</script>',
      '</div>', // footer
      '</div>', // container
    ].join( "\n" );
  }
  PendingResponse.end( [
    '<!DOCTYPE html><html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="'
    + 'width=device-width, initial-scale=1, maximum-scale=1.0, '
    + 'user-scalable=no, minimal-ui">',
    '<title>Kudocracy test UI, liquid democracy meets twitter...</title>',
    '<link rel="shortcut icon" href="http://simpliwiki.com/yanugred16.png" type="image/png">',
    head || '<link rel="stylesheet" type="text/css" href="/simpliwiki.css">',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>'
  ].join( '\n' ) );
  PendingResponse = null;
};

var HttpQueue = l8.queue( 1000 );
var input = l8.Task( function( question ){ this
  .step( function(){
    respond( question );
    HttpQueue.get() } )
  .step( function( req, res ){
    //this.trace( "Handling new http request, " + req.method + ", " + req.url );
    if( req.method !== "GET" || !( req.url === "/" || req.url[1] == "?" ) ){
      res.writeHead( 404, { "Content-Type": "text/plain" } );
      res.end( "404 Not Found\n" );
      return input( question );
    }
    // Detect change in source ip address, when change, logout
    // ToDo: some session management
    var ip = req.headers[ "x-forwarded-for" ]
    || req.connection.remoteAddress
    || req.socket.remoteAddress
    || req.connection.socket.remoteAddress;
    // ToDo: detect simpliwiki login credentials
    Session.current.login( ip );
    PendingResponse = res;
    PendingResponse.request = req;
    PendingResponse.query = url.parse( req.url, true).query
    var data = PendingResponse.query.input;
    var more = PendingResponse.query.input2;
    if( data ){
      if( more ){ data += " " + more; }
      more = PendingResponse.query.input3;
      if( more ){ data += " " + more; }
      more = PendingResponse.query.input4;
      if( more ){ data += " " + more; }
      more = PendingResponse.query.input5;
      if( more ){ data += " " + more; }
      return data.substring( 0, 140 );
    }
    // Default to page index if no command was provide at all
    return "page index";
    //input( question );
  } );
} );

/*
 *  Test UI is made of pages.
 *
 *  Each page is a function that returns an array of two elements. The
 *  first element is to become the "head" of the HTML response, the second
 *  element is the body.
 *  Note: this is currently purely sync but moving to async will be simple to
 *  do when required.
 */

var http_repl_pages = {
  index:        page_index,
  help:         page_help,
  login:        page_login,
  visitor:      page_visitor,
  persona:      page_persona,
  delegations:  page_delegations,
  groups:       page_groups,
  proposition:  page_proposition,
  propositions: page_propositions,
  tags:         page_propositions,
  votes:        page_votes
};

function page( name ){
  var f = name && http_repl_pages[ name ];
  // No name => list names
  if( !f ){
    for( name in http_repl_pages ){
      printnl( name );
    }
    return;
  }
  var head = null;;
  var body = null;
  var result;
  try{
    result = f.apply( this, arguments );
    head = result[ 0 ];
    body = result[ 1 ];
    if( Array.isArray( head ) ){
      head = head.join( "" );
    }
    if( Array.isArray( body ) ){
      body = body.join( "" );
    }
    Session.current.previous_page = Session.current.current_page;
    Session.current.current_page  = Array.prototype.slice.call( arguments );
  }catch( err  ){
    trace( "Page error", name, err, err.stack );
  }
  set_head( head );
  set_body( body );
};

function redirect( page ){
// Set HTTP response to 302 redirect, to redirect to specified page
  if( !PendingResponse )return;
  if( !page ){ page = "index"; }
  page = encodeURIComponent( page );
  PendingResponse.redirect = "?input=page%20" + page;
}

function redirect_back( n ){
// Set HTTP response to 302 redirect, to redirect to the page from where the
// current HTTP request is coming.
  if( !Session.current.current_page )return redirect( "propositions" );
  var target = Session.current.current_page.slice( 0, ( n || 1 )  );
  redirect( target.join( " " ) );
}

/*
 *  <a href="...">links</a>
 */

function link_to_command( cmd ){
  var url_code = querystring.escape( cmd );
  return '<a href="?input=' + url_code + '">' + cmd + '</a>';
}

function link_to_page( page, value, title ){
  var url_code;
  if( page[0] === "@" ){
    url_code= querystring.escape( page );
    if( !value ){ value = page; }
    page = value;
  }else{
    var url_code= querystring.escape( value || "" );
  }
  if( page === "index"){
    value = '<strong>Kudo<em>c</em>racy</strong>';
  }
  if( !value ){ value = page; }
  page = encodeURIComponent( page );
  return '<a href="?input=page+' + page + '+' + url_code + '">'
  + (title || value)
  + '</a>';
}

function link_to_twitter_user( user ){
  return '<a href="https://twitter.com/' + user + '">' + user + '</a>';
}

function link_to_twitter_tags( tags ){
  if( tags.indexOf( " " ) !== -1 ){
    var buf = [];
    tags.split( " " ).forEach( function( tag ){
      if( !tag )return;
      buf.push( link_to_twitter_tags( tag ) );
    });
    return buf.join( " " );
  }
  return '<a href="https://twitter.com/search?f=realtime&q=%23'
  + tags.substring( 1 )
  + '">' + tags + '</a>';
}

function link_to_twitter_filter( query ){
  return '<a href="https://twitter.com/search?f=realtime&q='
  + querystring.escape( query )
  + '">' + query + '</a>';
}


/*
 *  Page common elements/parts
 */


function page_style(){
  return '<link rel="stylesheet" href="http://simpliwiki.com/simpliwiki.css" type="text/css">'
  + '<script type="text/javascript" src="http://code.jquery.com/jquery-2.1.1.min.js"></script>'
  // Reuse some stuff from simpliwiki
  + '<script type="text/javascript"> Wiki = {}; </script>\n'
  + '<script src="http://simpliwiki.com/scrollcue.js"></script>'
  + '<script type="text/javascript"> Wiki.scrollcueScript( true ); </script>\n';
  //+ '<script type="text/javascript">' + scrollcue + '\nscrollcue( $ );'
  //+ '\n$.scrollCue( { fade:".fade" } );\n'
  //+ '</script>\n';
}


function page_header( left, center, right ){
  if( !left ){
    left = link_to_page( "index" );
  }
  if( Session.current.visitor ){
    right = ( (right && (right + " ")) || "" )
    + link_to_page(
      Session.current.visitor.label,
      "visitor",
      Session.current.visitor.label
    );
  }else{
    right = ( (right && (right + " ")) || "" )
      + link_to_page( "login" );
  }
  return [
    '<div class="header" id="header"><div id="header_content">',
      '<div class="top_left">',
        left || "",
      '</div>',
      '<div class="top_center" id="top_center">',
        center || "",
      '</div>',
      '<div class="top_right">',
        ( (right && (right + " ")) || "" ) + link_to_page( "help" ),
      '</div>',
    '</div></div><br><br>',
    '<div id="container" style="margin:0.5em;"><div id="content" ><div id="content_text">',
    ''
  ].join( "\n" );
}

function page_footer(){
  return [
    '\n</div></div></div><div class="" id="footer"><div id="footer_content">',
    link_to_page( "propositions", "", "propositions" ), " ",
    link_to_page( "tags", "", "tags" ),
    '<div id="powered"><a href="https://github.com/virteal/kudocracy">',
    '<img src="http://simpliwiki.com/yanugred16.png"/>',
    '<strong>kudo<em>c</em>racy</strong>',
    '</a></div>',
    '</div></div>',
    '<script>!function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0],p=/^http:/.test(d.location)?"http":"https";if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src=p+"://platform.twitter.com/widgets.js";fjs.parentNode.insertBefore(js,fjs);}}(document, "script", "twitter-wjs");</script>',
  ].join( "" );
}

function page_index(){
  Session.current.clear();
  return [ '<link rel="stylesheet" href="http://simpliwiki.com/style.css" type="text/css">',
  [
    '<img src="http://simpliwiki.com/alpha.gif" type="img/gif" style="position:absolute; top:0; right:0;"></img>',
    '<div id="background" class="background"></div>',
    '<div id="header" class="sw_header">',
      '<div class="sw_header_content">',
        '<div style="float:left;" class="sw_logo sw_boxed">',
          '<div style="float:left;">',
          '<img src="http://simpliwiki.com/yanugred64.png" width="64" height="64" type="image/png" alt="YanUg"/>',
          '</div>',
          '<div id="slogan" style="min-height:64px; height:64px;">',
          '<strong>' + link_to_twitter_tags( "#kudocracy" ) + '</strong>',
          '<br>new democracy',
          '</div>',
        '</div>',
        '<span id="tagline">',
        '<h3 id="tagline">',
          link_to_twitter_tags(
            "#democracy #vote #election #LiquidDemocracy #participation"
          ),
        '</h3>',
        //'<small><i>a tribute to <a href="http://wikipedia.org">Wikipedia</a></i></small>',
        '</span>',
      '</div>',
    '</div><br><br>',
    '<div id="footer" class="sw_footer sw_boxed">',
    '\n <form name="proposition" url="/">',
    '<span style="font-size:1.5em">' + emoji( "agree" ) + ' </span>',
    '<input type="hidden" name="input" maxlength="140" value="page propositions"/>',
    '<input type="search" placeholder="all" name="input2" value="new"/>',
    ' <input type="submit" value="propositions?"/>',
    '</form>\n',
    '</div>',
    '<br><a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy&hashtags=vote&text=new%20democracy" class="twitter-hashtag-button" data-related="Kudocracy,vote">Tweet #kudocracy</a>',
    ' <a href="https://twitter.com/Kudocracy" class="twitter-follow-button" data-show-count="true">Follow @Kudocracy</a>',
    // Twitter buttons
    '<script>!function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0],p=/^http:/.test(d.location)?"http":"https";if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src=p+"://platform.twitter.com/widgets.js";fjs.parentNode.insertBefore(js,fjs);}}(document, "script", "twitter-wjs");</script>',
    //'<div><div><div>' + page_footer()
  ].join( "" ) ];
}


function page_help(){
  var r = [
    page_style(),
    [ ]
  ];
  r[1] = [
    page_header(
      _,
      link_to_twitter_tags( "#kudocracy" ),
      link_to_page( "propositions" )
    ),
    '<div style="max-width:50em">',
    '<h2>What is it?</h2><br>',
    'An experimental Liquid Democracy voting system where ',
    'people can ' + emoji( "agree" ) + 'like/'
    + emoji( "disagree" ) + 'dislike hashtags.',
    '<br><br><h2>hashtags?</h2><br>',
    'Hashtags are keywords used to categorize topics in social networks. ',
    'See also ',
    '#<a href="http://www.hashtags.org/quick-start/">hashtags.org</a>.',
    '<br><br><h2>How is it different?</h2><br>',
    'Traditional voting systems with elections every so often capture ',
    'infrequent snapshots of the opinion. Because voting often is inconvenient, ',
    'elections are either rare or participation suffers. Most decisions ',
    'are therefore concentrated in the hands of a few representatives ',
    'who are subject to corruption temptations. Liquid Democracy promises ',
    'to solves these issues thanks to modern technologies.',
    '<br><br><ul>',
    '<li>With <strong>Kudo<em>c</em>racy</strong>:</li>',
    '<li>Votes are reversible, you can change your mind.</li>',
    '<li>Propositions are searchable using tags.</li>',
    '<li>Delegates may vote for you on some propositions.</li>',
    '<li>You can follow their recommendations or vote directly.</li>',
    '<li>Votes and delegations are ephemeral and disappear unless renewed.</li>',
    '<li>Results are updated in realtime, trends are made visible.</li>',
    '<li>You can share your votes or hide them.</li>',
    '<li>It is <a href="https://github.com/virteal/kudocracy">open source</a>.</li>',
    '</ul>',
    '<br><h2>Is it available?</h2><br>',
    'No, not yet. What is available is a prototype. Depending on ',
    'success (vote #kudocracy!), the prototype will hopefully expand into ',
    'a robust system able to handle billions of votes from millions of ',
    'persons. That is not trivial and requires help.',
    '<br><br><h2>Who are you?</h2><br>',
    'My name is Jean Hugues Robert, ',
    link_to_twitter_user( "@jhr" ),
    '. I am a 48 years old software developper ',
    'from Corsica (the island where Napoleon was born). When I discovered the',
    ' <a href="http://en.wikipedia.org/wiki/Delegative_democracy">',
    'Delegative democracy</a> concept, I liked it. I think that it would ',
    'be a good thing to apply it broadly, using modern technology, technology ',
    'that people now use all over the world.<br>' +
    'I hope you agree. ',
    '</div>',
    // Twitter tweet & follow buttons
    (   '<a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy'
      + '&hashtags=agree,kudocracy,democracy,vote,participation,LiquidDemocracy'
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet #kudocracy</a>'
    ),(
      ' <a href="https://twitter.com/Kudocracy'
      + '" class="twitter-follow-button" data-show-count="true">'
      + 'Follow @Kudocracy</a>'
    ),
    '<br><br><h2>Misc</h2><br>',
    'Debug console: ' + link_to_command( "help" ),
    '<br><br>',
    page_footer()
  ];
  return r;
}


function vote_menu( vote, proposition, orientation ){
  function o( v, l ){v
    return '\n<option value="' + v + '">' + (v || l) + '</option>';
  }
  var with_comment = "";
  // vote is either a vote or a persona
  var vote_id;
  if( vote.type === "Vote" ){
    vote_id = vote.id;
    proposition = vote.proposition;
    with_comment = true;
  }else{
    vote_id = "" + vote.id + "." + proposition.id;
  }
  if( with_comment ){
    with_comment = '<input type="search" name="comment" placeholder="comment" ';
    if( vote.comment() ){
      with_comment += 'value="' + Wiki.htmlizeAttr( vote.comment().text ) + '"';
    }
    with_comment += '/> ';
  }
  var tags = proposition.tags_string()
  .replace( " #recent", "" )
  .replace( " #yesterday", "" )
  .replace( " #today", "" );
  var comment;
  var remain = 140 - " #kudcracy #vote".length;
  if( with_comment && vote.comment() ){
    comment = encodeURIComponent( vote.comment().text.substring( 0, remain ) );
  }else{
    comment = "new%20democracy"
  }
  return [
    '\n<form name="vote" url="/">',
    '<input type="hidden" name="input" value="change_vote"/>',
    '<input type="hidden" name="vote_id" value="' + vote_id + '"/>',
    with_comment,
    '<select name="orientation">',
    // ToDo: randomize option order?
    o( "orientation" ), o( "agree"), o( "disagree" ), o( "protest" ), o( "blank" ), o( "delete" ),
    '</select>',
    '<select name="privacy">',
    o( "privacy" ), o( "public"), o( "secret" ), o( "private" ),
    '</select>',
    '<select name="duration">',
    o( "duration" ), o( "one year"), o( "one month" ), o( "one week" ),
    o( "24 hours" ), o( "one hour"),
    '</select>',
    ' <input type="submit" value="Vote"/>',
    '</form>\n',
    // Twitter tweet button
    '<a href="https://twitter.com/intent/tweet?button_hashtag='
    + (proposition.is_tag()
      ? proposition.label.substring( 1 )
      : proposition.label )
    + '&hashtags=kudocracy,vote,'
    + (Kudo.type !== "Vote"
      ? (orientation && orientation + "," || "")
      : vote.orientation() + ","
      )
    + tags.replace( / /g, "," ).replace( /#/g, "")
    + '&text=' + comment
    + '" class="twitter-hashtag-button" '
    + 'data-related="Kudocracy,vote">Tweet ' + proposition.label + '</a>'
  ].join( "" );
}


function delegate_menu( delegation ){
  function o( v, l ){v
    return '\n<option value="' + v + '">' + (v || l) + '</option>';
  }
  return [
    '\n<form name="delegation" url="/">',
    '<input type="hidden" name="input" '
      + 'value="change_delegation &' + delegation.id + '"/>',
    '<select name="privacy">',
    o( "privacy" ), o( "public"), o( "secret" ), o( "private" ),
    '</select>',
    ' <select name="duration">',
    o( "duration" ), o( "one year"), o( "one month" ), o( "one week" ),
    o( "24 hours" ), o( "one hour"),
    '</select>',
    ' <input type="submit" value="Delegate"/>',
    '</form>\n',
    // Twitter tweet button
    '\n<a href="https://twitter.com/intent/tweet?button_hashtag='
    + delegation.agent.label.substring( 1 )
    + '&hashtags=kudocracy,vote,'
    + delegation.tags_string().replace( / /g, "," ).replace( /#/g, "")
    + '&text=new%20democracy%20%40' + delegation.agent.label.substring( 1 ) + '" '
    + 'class="twitter-hashtag-button" '
    + 'data-related="Kudocracy,vote">Tweet #'
    + delegation.agent.label.substring( 1 ) + '</a>'
  ].join( "" );
}


function page_visitor( page_name, name, verb, filter ){
// The private page of a persona
  var persona = ( name && Persona.find( name ) ) || Session.current.visitor;
  if( !persona )return [ _, "Persona not found: " + name ];

  filter = Session.current.set_filter( filter || (verb = "Search" && "all" ) );

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      link_to_twitter_user( persona.label ),
      link_to_page( "propositions" )
      + " " + link_to_page( persona.label, "delegations" )
      + " " + link_to_page( persona.label, "persona", "public" )
    ) ]
  ];
  var buf = [];

  buf.push( '<h1>' + persona.label + '</h1><br><br>' );

  // Query to filter for tags
  buf.push( filter_label( filter, "propositions" ) );
  buf.push( [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="input" maxlength="140" value="page visitor ' + persona.label + '"/>',
    '<input type="search" placeholder="all" name="input3" value="',
      Session.current.has_filter() ? Session.current.filter + " #" : "",
    '"/>',
    ' <input type="submit" name="input2" value="Search"/>',
    '</form><br>\n'
  ].join( "" ) );

  // Votes, recent first
  var votes = persona.votes()
  votes = votes.sort( function( a, b ){
    return b.time_touched - a.time_touched;
  });
  buf.push( '<div><h2>Votes</h2>' );

  votes.forEach( function( entity ){

    if( !entity.filtered( Session.current.filter, Session.current.visitor ) )return;

    buf.push( '<br><br>'
      + ' ' + link_to_page( "proposition", entity.proposition.label ) + ' '
      //+ "<dfn>" + emojied( entity.proposition.result.orientation() ) + '</dfn>'
      + '<br><em>' + emojied( entity.orientation() ) + "</em> "
      + "<dfn>(" + entity.privacy() + ")</dfn>"
      + ( entity.is_direct()
        ? ""
        :  "<dfn>(via " + link_to_page( "persona", entity.delegation().agent.label ) + ")</dfn>" )
      + ", for " + duration_label( entity.expire() - Kudo.now() )
      + vote_menu( entity )
    )

  });
  buf.push( "</div><br>" );

  // Delegations
  var delegations = persona.delegations();
  buf.push( "<div><h2>Delegations</h2><br>" );
  //buf.push( "<ol>" );

  delegations.forEach( function( entity ){

    if( !entity.filtered( Session.current.filter, Session.current.visitor ) )return;

    buf.push( '<br>' // "<li>"
        + link_to_page( "persona", entity.agent.label )
        //+ ' <small>' + link_to_twitter_user( entity.agent.label ) + '</small> '
        + ( entity.is_inactive() ? " <dfn>(inactive)</dfn> " :  " " )
        + link_to_page( "propositions", entity.filter_string( persona ) )
        //+ ' <small>' + link_to_twitter_filter( entity.filter_string( persona ) ) + '</small>'
        + "</li>"
    )
  });

  // Footer
  buf.push( "</div><br>" );
  buf.push( page_footer() );
  r[1] = r[1].concat( buf );
  return r;
}


function page_persona( page_name, name, verb, filter ){
// This is the "public" aspect of a persona
  var persona = Persona.find( name );
  if( !persona )return [ _, "Persona not found: " + name ];

  filter = Session.current.set_filter( filter || (verb = "Search" && "all" ) );

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      link_to_twitter_user( persona.label ),
      link_to_page( "propositions" )
      + ( Session.current.visitor === persona
        ?   " " + link_to_page( "delegations" )
          + " " + link_to_page( persona.label, "visitor", "votes" )
        : "" )
    ) ]
  ];
  var buf = [];

  buf.push( '<h1>' + persona.label + '</h1><br><br>' );

  // Twitter follow button
  buf.push(
    '<a href="https://twitter.com/' + persona.label
    + '" class="twitter-follow-button" data-show-count="true">'
    + 'Follow ' + persona.label + '</a>'
  );

  // Query to filter for tags in persona's votes
  buf.push( filter_label( filter ) );
  buf.push( [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="input" maxlength="140" value="page persona ' + persona.label + '"/>',
    ' <input type="search" placeholder="all" name="input3" value="',
      Session.current.has_filter() ? Session.current.filter + " #" : "",
    '"/>',
    ' <input type="submit" name="input2" value="Search"/>',
    '</form>\n'
  ].join( "" ) );

  // Votes, recent first
  var votes = persona.votes();
  votes = votes.sort( function( a, b ){
    return b.time_touched - a.time_touched;
  });
  buf.push( '<br><br><div><h2>Votes</h2><br>' );
  //buf.push( "<ol>" );

  votes.forEach( function( entity ){

    if( !entity.filtered( Session.current.filter, Session.current.visitor ) )return;

    buf.push( '<br>' ); // "<li>" );
    if( entity.is_private() ){
      buf.push( "private" );
    }else{
      buf.push( ''
        +  ( entity.is_secret()
          ? "secret"
          : "<em>" + emojied( entity.orientation() ) ) + "</em> "
        + '' + link_to_page( "proposition", entity.proposition.label ) + ' '
        + " <dfn>" + time_label( entity.time_touched ) + "</dfn> "
        //+ " <dfn>" + emojied( entity.proposition.result.orientation() ) + "</dfn> "
        //+ time_label( entity.proposition.result.time_touched )
        //+ "<dfn>(" + entity.privacy() + ")</dfn>"
        + ( entity.is_direct() || !entity.delegation().is_public()
          ? ""
          :  "<dfn>(via " + link_to_page( "persona", entity.delegation().agent.label ) + ")</dfn> " )
        //+ ", for " + duration_label( entity.expire() - Kudo.now() )
      );
    }
    //buf.push( "</li>" );
  });

  // buf.push( "</ol></div><br>" );
  buf.push( '</div><br>' );
  buf.push( page_footer() );
  r[1] = r[1].concat( buf );
  return r;
}


function page_delegations( page_name, name, verb, filter ){
// The private page of a persona's delegations
  var persona = ( name && Persona.find( name ) ) || Session.current.visitor;
  if( !persona )return [ _, "Persona not found: " + name ];

  filter = Session.current.set_filter( filter || (verb = "Search" && "all" ) );

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      link_to_twitter_user( persona.label ),
      link_to_page( "propositions" )
      + " " + link_to_page( persona.label, "persona", "public" )
      + " " + link_to_page( persona.label, "visitor", "votes" )
    ) ]
  ];
  var buf = [];

  buf.push( '<h1>' + persona.label + '</h1><br><br>' );

  // Query to filter for tags
  buf.push( filter_label( filter, "propositions" ) );
  buf.push( [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="input" maxlength="140" value="page delegations ' + persona.label + '"/>',
    '<input type="search" placeholder="all" name="input3" value="',
      Session.current.has_filter() ? Session.current.filter + " #" : "",
    '"/>',
    ' <input type="submit" name="input2" value="Search"/>',
    '</form><br>\n'
  ].join( "" ) );

  // Delegations
  var delegations = persona.delegations();
  buf.push( "<div><h2>Delegations</h2>" );

  delegations.forEach( function( entity ){

    if( !entity.filtered( Session.current.filter, persona ) )return;

    buf.push( '<br><br>'
      + link_to_page( "persona", entity.agent.label )
      + ( entity.is_inactive() ? " <dfn>(inactive)</dfn> " :  " " )
      + link_to_page( "propositions", entity.filter_string( persona ) )
      + "<br><dfn>(" + entity.privacy() + ")</dfn>"
      + ", for " + duration_label( entity.expire() - Kudo.now() )
    + delegate_menu( entity )
    )
  });

  // Footer
  buf.push( "</div><br>" );
  buf.push( page_footer() );
  r[1] = r[1].concat( buf );
  return r;
}


function page_groups( page_name, name ){
  var r = [ page_style(), null ];
  var persona = Persona.find( name );
  if( !persona ){
    r[1] = "Persona not found: " + name;
    return r;
  }
  r[1] = pretty( persona.value() );
  return r;
}


function filter_label( filter, page ){
  var buf = [];
  if( filter ){
    buf.push( "<div>" );
    filter.split( " " ).forEach( function( tag ){
      buf.push( link_to_page( page || "propositions", tag, tag ) + " " );
    });
    buf.push( '</div>' );
  }
  return buf.join( "" );
}


function page_propositions( page_name, filter ){
// This is the main page of the application, either a list of tags or
// propositions, filtered.

  var tag_page = page_name === "tags";

  var persona = Session.current.visitor;
  filter = Session.current.set_filter( filter );
  if( !persona && filter === "#new" ){
    filter = Session.current.set_filter( "hot" );
  }

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      Session.current.has_filter()
      ? link_to_twitter_tags( Session.current.filter )
      : link_to_twitter_tags(
        "#vote #kudocracy"
      ),
      link_to_page( tag_page ? "propositions" : "tags" )
      + " " + link_to_page( "votes" )
    ) ]
  ];
  var buf = [];

  buf.push( tag_page ? "<br><h3>Tags</h3>" : "<br><h3>Propositions</h3>" );
  if( Session.current.has_filter() ){
    buf.push( ' tagged <h1>' + Session.current.filter + '</h1><br>' );
    var persona_tag = Persona.find( Session.current.filter.replace( "#", "@" ) );
    if( persona_tag ){
      buf.push( link_to_page( "persona", persona_tag.name ) + '<br>' );
    }
    var tag_topic = Topic.find( Session.current.filter );
    var comment;
    if( comment = Topic.reserved_comment( Session.current.filter ) ){
      buf.push( '<br><dfn>' + comment + '</dfn><br><br>' );
    }else if( comment = tag_topic ? tag_topic.comment() : "" ){
      buf.push( '<br>' + format_comment( comment.text ) + '<br><br>' );
    }else{
      buf.push( '<br>' );
    }
    
  }

  // Twitter tweet button, to tweet about the filter
  if( Session.current.has_filter() ){
    buf.push( '<a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy'
      + '&hashtags=vote,'
      + Session.current.filter_tags_label()
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet #kudocracy</a>'
    );
  }

  // Query to search for tags or create a proposition
  buf.push( [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="input" maxlength="140" value="change_proposition"/>',
    '<input type="search" placeholder="all" name="input3" value="',
      Session.current.has_filter() ? Session.current.filter + " #" : "",
    '"/>',
    ' <input type="submit" name="input2" value="Search"/>'
    + ( Session.current.visitor
      && Session.current.has_filter()
      && Session.current.filter_tags.length
      ? ' <input type="submit" name="input2" value="Delegate"/>' : "" )
    + ( Session.current.visitor && !string_tags_includes( Session.current.filter, "#but" ) 
      ? ' <input type="submit" name="input2" value="Propose"/>' : "" ),
    '</form>\n'
  ].join( "" ) );

  // Display list of matching propositions or tags
  var propositions = Topic.all;
  var list = [];
  var count = 0;
  var attr;
  var entity;
  var visitor_tag = null;;
  if( Session.current.visitor ){
    visitor_tag = "#" + Session.current.visitor.label.substring( 1 );
  }

  for( attr in propositions ){

    entity = propositions[ attr ];

    // Apply filter
    if( !entity || entity.expired() )continue;
    if( entity.is_tag() ){
      if( !tag_page )continue;
    }else{
      if( tag_page )continue;
    }
    if( !entity.filtered( Session.current.filter, persona ) )continue;

    // Filter out propositions without votes unless current user created it
    if( !entity.result.total()
    && ( !visitor_tag || !entity.is_tagged( visitor_tag ) ) // ToDo: remove #jhr mention
    && ( !visitor_tag || visitor_tag !== "#jhr" )  // Enable clean up during alpha phase
    )continue;

    list.push( entity );
  }

  list = list.sort( function( a, b ){
    // The last consulted proposition is hot
    if( a === Session.current.proposition )return -1;
    if( b === Session.current.proposition )return 1;
    // Other proposition's heat rule
    return b.heat() - a.heat()
  });

  list.forEach( function( proposition ){

    count++;
    var text = proposition.label;
    if( tag_page ){
      text += " is a good tag";
    }
    buf.push(
      '<br><h3>' + emoji( proposition.result.orientation() )
      + link_to_page( "proposition", proposition.label, text )
      + '</h3>'
    );
    //if( proposition.result.orientation() ){
    //  buf.push( ' <em>' + emojied( proposition.result.orientation() ) + '</em>' );
    //}
    buf.push( '<br>' );
    proposition.tags_string().split( " " ).forEach( function( tag ){
      if( !tag )return;
      buf.push( link_to_page( page_name, tag ) + " " );
    });
    //buf.push( '<small>' + link_to_twitter_tags( proposition.tags_string() + '</small><br>' ) );
    buf.push( '<br>' + proposition_summary( proposition.result ) + '<br>' );

    if( tag_page ){
      buf.push( "" + proposition.propositions().length + " "
        + link_to_page( "propositions", proposition.label, "propositions" ) + "<br>"
      )
    }

    if( Session.current.visitor ){
      var vote_entity = Vote.find( Session.current.visitor.name + "." + proposition.name );
      if( vote_entity ){
        buf.push( 'you: '
          + vote_entity.orientation()
          + "<dfn>(" + vote_entity.privacy() + ")</dfn>"
          + ( vote_entity.is_direct()
            ? ""
            :  "<dfn>(via " + link_to_page( "persona", vote_entity.delegation().agent.label ) + ")</dfn>" )
          + ", for " + duration_label( vote_entity.expire() - Kudo.now() )
        );
        buf.push( vote_menu( vote_entity ) );
      }else{
        buf.push( vote_menu( Session.current.visitor, proposition ) );
      }
      buf.push( '<br>' );
    }
  });

  if( !count ){
    if( Session.current.filter === "#new" ){
      Session.current.set_filter( "hot" );
      redirect( "propositions recent" );
    }else if( Session.current.filter === "#hot" ){
      Session.current.set_filter( "recent" );
      redirect( "propositions recent" );
    }else if( Session.current.filter === "#recent" ){
      Session.current.set_filter( "" );
      redirect( "propositions" );
    }
  }
  
  buf.push(  "<br>" + page_footer() );
  r[1] = r[1].concat( buf );
  return r;
}


function page_votes( page_name, filter ){
// This is the votes page of the application, filtered.

  var persona = Session.current.visitor;
  filter = Session.current.set_filter( filter );
  if( !filter ){
    // Session.current.set_filter( "hot" );
  }

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      Session.current.has_filter()
      ? link_to_twitter_tags( Session.current.filter )
      : link_to_twitter_tags(
        "#vote #kudocracy"
      ),
      link_to_page( "propositions" )
    ) ]
  ];
  var buf = [];

  buf.push( "<br><h3>Votes</h3>" );
  if( Session.current.has_filter() ){
    buf.push( ' tagged <h1>' + Session.current.filter + '</h1><br><br>' );
  }

  // Twitter tweet button, to tweet about the filter
  if( Session.current.has_filter() ){
    buf.push( '<a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy'
      + '&hashtags=vote,'
      + Session.current.filter_tags_label()
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet #kudocracy</a>'
    );
  }

  // Query to search for votes
  buf.push( [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="input" maxlength="140" value="change_proposition"/>',
    '<input type="search" placeholder="all" name="input3" value="',
      Session.current.has_filter() ? Session.current.filter + " #" : "",
    '"/>',
    ' <input type="submit" name="input2" value="Search"/><br>'
  ].join( "" ) );

  // Display list of matching votes
  var votes = Vote.log;
  var list = [];
  var vote_value;
  var entity;
  var visitor_tag = null;;
  if( Session.current.visitor ){
    visitor_tag = "#" + Session.current.visitor.label.substring( 1 );
  }
  var ii = votes.length;
  var count = 0;
  var proposition;

  while( ii-- ){

    vote_value = votes[ ii ];
    entity = vote_value.entity;

    if( !entity || !entity.filtered( Session.current.filter, persona ) )continue;

    // Filter out propositions without votes unless current user created it
    if( !entity.proposition.result.total()
    && ( !visitor_tag || !entity.proposition.is_tagged( visitor_tag ) ) // ToDo: remove #jhr mention
    && ( !visitor_tag || visitor_tag !== "#jhr" )  // Enable clean up during alpha phase
    )continue;

    // Keep public votes
    if( vote_value.delegation          === Vote.direct
    && vote_value.privacy              === Vote.public
    && vote_value.orientation          !== Vote.neutral
    && vote_value.entity.privacy()     === Vote.public
    && vote_value.entity.orientation() !== Vote.neutral
    ){
      count++;
      proposition = vote_value.entity.proposition;
      buf.push( "<br>" + ( proposition.is_tag() ? "tag " : "" ) );
      buf.push( link_to_page( "proposition", proposition.label ) );
      buf.push(
        ' <em>' + emojied( vote_value.orientation ) + "</em> "
        + link_to_page( "persona", vote_value.persona_label )
        + " <small><dfn>" + time_label( vote_value.snaptime ) + "</dfn></small>"
      );
      if( vote_value.comment_text ){
        buf.push( ' ' + format_comment( vote_value.comment_text ) );
      }
      // buf.push( "</li>" );
    }
  }

  if( !count ){
    if( Session.current.filter === "#new" ){
      Session.current.set_filter( "hot" );
      redirect( "votes recent" );
    }else if( Session.current.filter === "#hot" ){
      Session.current.set_filter( "recent" );
      redirect( "votes recent" );
    }else if( Session.current.filter === "#recent" ){
      Session.current.set_filter( "" );
      redirect( "votes" );
    }
  }

  buf.push(  "<br><br>" + page_footer() );
  r[1] = r[1].concat( buf );
  return r;
}


function page_login( page_name ){

  // Header
  var r = [
    page_style(),
    [ page_header(
      _,
      link_to_twitter_tags(
        "#login #kudocracy"
      ),
      _ ) ]
  ];
  var buf = [];

  // Query for name
  buf.push( [
    '\n<form name="login" url="/">',
    '<label>Your twitter @name</label> ',
    '<input type="hidden" name="input" maxlength="30" value="login"/>',
    '<input type="text" name="input2"/>',
    ' <input type="submit" value="Login"/>',
    '</form>\n'
  ].join( "" ) );
  buf.push( "<br>" + page_footer() );
  r[1] = r[1].concat( buf );
  return r;

}


function emoji( name, spacer ){
  var tmp = emoji.table[ name ];
  if( !tmp )return "";
  if( !spacer )return tmp;
  return tmp + spacer;
}
emoji.table = {
  agree:    "&#xe00e;",    // Thumb up
  disagree: "&#xe421;",    // Thumb down
  protest:  "&#xe012;"     // raised hand
}

function emojied( text ){
  return text ? emoji( text ) + text : "";
}


function proposition_summary( result, div ){
  var buf = [];
  var orientation = result.orientation();
  if( !orientation ){ orientation = "";  }
  var comment = result.proposition.comment();
  if( div ){
    buf.push( '<div><h2>Summary' + ' <em>' + emojied( orientation ) + '</em>'
    //+ ( comment ? '<br>' + format_comment( comment.text ) : "" )
    + '</h2><br>' );
  }else{
    if( comment ){
      buf.push( format_comment( comment.text ) + '<br>' );
    }
    buf.push( "<em>" + orientation + "</em>. " );
  }
  buf.push( 'agree ' + result.agree() + " " );
  buf.push( 'against ' + result.against() + " " );
  buf.push( 'blank ' + result.blank() + ' ' );
  buf.push( '<br><dfn>protest ' + result.protest() + '</dfn> ' );
  buf.push( '<dfn>total ' + result.total() + ' ' );
  buf.push( '(direct ' + result.direct() + ' ' );
  buf.push( 'indirect ' + (result.total() - result.direct()) + ')</dfn> ' );
  buf.push( '<dfn>change ' + result.count() + ' ' );
  buf.push( time_label( result.time_touched ) + '</dfn>' );
  return buf.join( "" );
}

function i18n( msg ){
  if( msg === "il y a " )return "";
  return msg;
}

// section: include.js
function $include( file, prepand, postpand ){
// Like C's #include to some extend. See also $include_json().
// The big difference with require() is that whatever is declared using
// "var" is visible, whereas with require() local variables are defined in
// some different scope.
// The big difference with #include is that #include can be used anywhere
// whereas $include() can be used only as a statement.
// Please use $include_json() to include an expression.
// file is searched like require() does (if require.resolve() exists).
// File's content is not cached, I trust the OS for doing some caching better
// than myself. As a result, it works great with self modifying code...
// Another big difference is the fact that $include() will fail silently if
// the file cannot be read.
  var data
  var fs      = require( 'fs')
  var ffile   = ""
  var rethrow = false
  try{
    ffile = require.resolve ? require.resolve( file) : file
  }catch( err ){}
  // Silent ignore if file not found
  if( !ffile ){
    trace( "$include: no " + file)
    return
  }
  try{
    data = fs.readFileSync( ffile).toString()
    prepand  && (data = prepand + data)
    postpand && (data = data    + postpand)
    $include.result = undefined
    // trace( "$include() eval of:" + data)
    try{
      eval( data) // I wish I could get better error reporting
    }catch( err ){
      rethrow = true
      throw err
    }
    return $include.result
  }catch( err ){
    trace( "$include: " + file)
    if( true || rethrow ) throw err
  }
}

function $include_json( file ){
// Like C's #include when #include is used on the right side of an assignment
  return $include( file, ";($include.result = (", "));")
}
// section: end include.js

// section: end sectionize.js


// -------------------
// section: globals.js

// Some global constants
var SW = {
  // Needed at startup
  version:  "0.15",
  name:     "Kudocracy",	// Name of website
  debug:    true,		// Debug mode means lots of traces
  test:     false,		// Test mode
  dir:      "",		        // Local to cwd, where files are, must exist
  port:     1234,		// 80 default, something else if behind a proxy
  domain:   "",			// To build permalinks, empty => no virtual hosting
  static:   "",			// To serve static files, optionnal, ToDo: ?
  protocol: "http://",		// Idem, https requires a reverse proxy
  fbid:     "",                 // Facebook app ID
  twid:     "",			// Twitter app ID
  likey:    "",			// LinkedIn API key
  dbkey:    "",			// Dropbox key
  dbsecret: "",			// Dropbox secret
  shkey:    "",			// Shareaholic key
  scalable: false,		// ToDo: a multi-core/multi-host version
  style:    "",			// CSS string (or lesscss if "less" is found)

  // Patterns for valid page names, please change with great care only

  // ~= CamelCase, @#_[ are like uppercase, . - [ are like lowercase
  wikiwordCamelCasePattern:
    "[@#A-Z_\\[][a-z0-9_.\\[-]{1,62}[@#A-Z_\\[\\]]",
  // 3Code style
  wikiword3CodePattern:
    "3\w\w-\w\w\w-\w\w\w",
  // 4Codes
  wikiword4CodePattern:
    "4\w\w\w-\w\w\w\w-\w\w\w\w-\w\w\w\w",
  // Twitter hash tag
  wikiwordHashTagPattern:
    "#[A-Za-z][a-z_0-9]{2,30}",
  // Twitter name
  wikiwordTwitterPattern:
    "@[A-Za-z][A-Za-z_0-9]{2,30}",
  // email address, very liberal but fast
  wikiwordEmailPattern:
    "[a-z][a-z_0-9.-]{1,62}@[a-z0-9.-]{5,62}",
  // Free links, anything long enough but without / & infamous <> HTML tags
  // ToDo: I also filter out .", = and ' but I should not, but that would break
  wikiwordFreeLinkPattern:
    "[A-Za-z_]*\\[[^.='\"/<>\\]]{3,62}\\]",
  // Suffix, can follow any of the previous pattern
  wikiwordSuffixPattern:
    "(([\.][@#A-Z_a-z0-9-\\[\\]])|([@#A-Z_a-z0-9\\[\\]-]*))*",
  // Prefix, cannot precede a wikiword
  wikiwordPrefixPattern:
    "([^=@#A-Za-z0-9_~\?&\)\/\\\">.:-]|^)",
  // ToDo: Postfix anti pattern, cannot succede a wikiword, non capturing
  wikiwordPostfixAntiPattern: "",

  // Valid chars in 3Codes, easy to read, easy to spell
  // 23 chars => 23^8 possibilities, ~= 80 000 000 000, 80 billions
  // 4codes: 23^15 ~= a billion of billions, enough
  // Don't change that. If you change it, all exiting "public" key get confused
  valid3: "acefghjkprstuvxyz234678",	// avoid confusion (ie O vs 0...)

  // Pattern for dates, ISO format, except I allow lowercase t & z
  datePattern: "20..-..-..[tT]..:..:..\....[zZ]",

  // Delays:
  thereDelay:        30 * 1000,	// Help detect current visitors
  recentDelay:  30 * 60 * 1000,	// Recent vs less recent
  awayDelay:    10 * 60 * 1000,	// Help logout old guests
  logoutDelay: 2 * 3600 * 1000,	// Help logout inactive members
  saveDelay:         30 * 1000,	// Save context delay
  resetDelay: 12 * 3600 * 1000,	// Inactive wikis are unloaded
  hotDelay:  45 * 84600 * 1000,	// Short term memory extend

  // Hooks
  hookSetOption: null, // f( wiki, key, str_val, base) => null or {ok:x,val:y}
  hookStart:     null, // Called right before .listen()

  the: "end" // of the missing comma
}

// Compute the maximum numeric value of a 3Code (or 4Code)
// These are approximates because it does not fit in a javascript 53 bits
// integer
;(function compute_max_3Code(){
  var len = SW.valid3 * len
  // 8 chars for 3 codes, 15 for 4codes
  var nch = 8
  var max = 1
  while( nch-- ){ max = max * len }
  SW.max3code = max
  // 8 + 7 is 15
  nch = 7
  while( nch-- ){ max = max * len }
  SW.max4code = max
})()

// String pattern for all valid Wikiwords
SW.wikiwordPattern = "("
  + "("
  +       SW.wikiwordCamelCasePattern
  + "|" + SW.wikiword3CodePattern
  + "|" + SW.wikiword4CodePattern
  + "|" + SW.wikiwordHashTagPattern
  + "|" + SW.wikiwordTwitterPattern
  + "|" + SW.wikiwordEmailPattern
  + "|" + SW.wikiwordFreeLinkPattern
  + ")"
  // All previous followed by optionnal non space stuff, but not . ending
  + SW.wikiwordSuffixPattern
+ ")"

// String pattern for all ids
SW.wikiwordIdPattern = ""
  + "("
  +       SW.wikiwordTwitterPattern
  + "|" + SW.wikiwordEmailPattern
  + ")"

// From string patterns, let's build RegExps

// Pattern to isolate wiki words out of stuff
SW.wikiwords = new RegExp(
    SW.wikiwordPrefixPattern
  + SW.wikiwordPattern
  + SW.wikiwordPostfixAntiPattern
  , "gm"
)

// Pattern to check if a str is a wikiword
SW.wikiword
  = new RegExp( "^" + SW.wikiwordPattern              + "$")
// Pattern to check if a str in an id
SW.wikiwordId
  = new RegExp( "^" + SW.wikiwordIdPattern            + "$")
// Pattern for each type of wikiword
SW.wikiwordCamelCase
  = new RegExp( "^" + SW.wikiwordCamelCasePattern     + "$")
SW.wikiword3Code
  = new RegExp( "^" + SW.wikiword3CodePattern         + "$")
SW.wikiword4Code
  = new RegExp( "^" + SW.wikiword4CodePattern         + "$")
SW.wikiwordHashTag
  = new RegExp( "^" + SW.wikiwordHashTagPattern       + "$")
SW.wikiwordTwitter
  = new RegExp( "^" + SW.wikiwordTwitterPattern       + "$")
SW.wikiwordEmail
  = new RegExp( "^" + SW.wikiwordEmailPattern         + "$")
SW.wikiwordFreeLink
  = new RegExp( "^" + SW.wikiwordFreeLinkPattern      + "$")

// Some tests
if( true ){
  var De = true;
  // Smoke test
  if( !SW.wikiword.test( "WikiWord") ){
    De&&bug( "Pattern:", SW.wikiwordPattern)
    De&&mand( false, "Failed WikiWord smoke test")
  }
  // Some more tests, because things gets tricky some times
  var test_wikiwords = function (){
    function test( a, neg ){
      if( !De )return
      !neg && mand(  SW.wikiword.test( a), "false negative " + a)
      neg  && mand( !SW.wikiword.test( a), "false positive " + a)
      var match = SW.wikiwords.exec( " " + a + " ")
      if( !match ){
        mand( neg, "bad match " + a)
      }else{
        mand( match[1] == " ", "bad prefix for " + a)
        match = match[2]
        !neg && mand( match == a, "false negative match: " + a + ": " + match)
        neg  && mand( match != a, "false positive match: " + a + ": " + match)
        match = SW.wikiwords.exec( "~" + a + " ")
        if( match ){
          mand( neg, "bad ~match " + a)
        }
      }
    }
    function ok( a ){ test( a)       }
    function ko( a ){ test( a, true) }
    ok( "WikiWord")
    ok( "WiWi[jhr]")
    ok( "W_W_2")
    ok( "@jhr")
    ok( "@Jhr")
    ko( "@jhr.")
    ok( "@jhr@again")
    ko( "j-h.robert@")
    ko( "jhR@")
    ok( "#topic")
    ok( "#Topic")
    ok( "#long-topic5")
    ko( "Word")
    ko( "word")
    ko( " gar&badge ")
    ok( "UserMe@myaddress_com")
    ko( "aWiki")
    ko( "aWikiWord")
    ok( "_word_")
    ko( "_two words_")
    ok( "[free link]")
    ok( "User[free]")
    ok( "[free]Guest")
    ko( "[free/link]")
    ko( "linkedIn")
    ko( "shrtIn")
    ko( "badLinkIn")
    ok( "info@simpliwiki.com")
  }
  test_wikiwords()
}

// Each wiki has configuration options.
// Some of these can be overridden by wiki specific AboutWiki pages
// and also at session's level (or even at page level sometimes).
SW.config =
// section: config.json, import, optional, keep
// If file config.json exists, it's content is included, ToDo
{
  lang:           "en",	// Default language
  title:          "",	// User label of wiki, cool for 3xx-xxx-xxx ones
  cols: 50,		// IETF RFCs style is 72
  rows: 40,		// IETF RFCs style is 58
  twoPanes:       false,// Use right side to display previous page
  cssStyle:       "",	// CSS page or url, it patches default inlined CSS
  canScript:      true,	// To please Richard Stallman, say false
  open:           true,	// If true everybody can stamp
  premium:        false,// True to get lower Ys back
  noCache:        false,// True to always refetch fresh data
  backupWrites:   SW.debug,	// Log page changes in SW.dir/Backup
  mentorUser:     "",	// default mentor
  mentorCode:     "",	// hard coded default mentor's login code
  mentors:        "",	// Users that become mentor when they log in
  adminIps:       "",	// Mentors from these addresses are admins
  debugCode:      "",	// Remote debugging
  fbLike:         true,	// If true, Like button on some pages
  meeboBar:       "",   // Meebo bar name, "" if none, ToDo: retest
}
// section: end config.json

// Local hooks makes it possible to change (ie hack) things on a local install
// This is where one want to define secret constants, ids, etc...
$include( "hooks.js")
if( SW.name != "SimpliJs" ){
  trace( "Congratulations, SimpliJs is now " + SW.name)
  if( SW.dir ){
    trace( "wiki's directory: " + SW.dir)
  }else{
    trace( "wiki is expected to be in current directory")
    trace( "See the doc about 'hooks', SW.dir in 'hooks.js'")
  }
  if( SW.port == "1234" ){
    trace( "default 1234 port")
    trace( "see the doc about 'hooks', SW.port in 'hooks.js'")
  }
}else{
  trace( "Humm... you could customize the application's name")
  trace( "See the doc about 'hooks', SW.name in 'hooks.js'")
}

// Let's compute "derived" constants

SW.idCodePrefix = "code" + "id"

// Global variables
var Sw = {
  interwikiMap: {},	// For interwiki links, actually defined below
  sessionId: 0,         // For debugging
  currentSession: null, // Idem
  requestId: 0,
  timeNow: 0,
  dateNow: 0,
  cachedDateTooltips: {},
  inspectedObject: null
}

// section: end globals.js


/* ---------------------------------------------------------------------------
 *  Extracted from SimpliWiki and adapted
 */

var Wiki = {};

Wiki.redize = function( str ){
  if( !str )return ""
  return "<em>" + str.substr( 0, 1) + "</em>" + str.substr( 1)
}

Wiki.htmlizeMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;"
}

Wiki.htmlize = function( txt ){
// Per HTML syntax standard, &, < and > must be encoded in most cases, <script>
// CDATA and maybe <textarea> are the exceptions.
  // Protect pre-encoded i18n stuff, unless "HTML" in text tells differently
  if( txt.indexOf( "HTML") < 0 ){
    txt = txt.replace( /&([a-z]{2,7};)/, "\r$1")
  }
  var map = Wiki.htmlizeMap
  txt = txt.replace( /[&<>]/g, function( ch ){ return map[ch] })
  // Restore pre-encoded i18n stuff
  txt = txt.replace( /\r([a-z]{2,7};)/, "&$1")
  return txt
}

Wiki.dehtmlizeMap = {
  "&amp;": "&",
  "&lt;":  "<",
  "&gt;":  ">"
}

Wiki.dehtmlize = function( txt ){
  var map = Wiki.dehtmlizeMap
  return txt.replace( /(&.*;)/g, function( ch ){ return map[ch] })
}

Wiki.htmlizeAttrMap = {
  "&": "&amp;",
  '"': "&quot;",
  "'": "&#39;"
}

Wiki.htmlizeAttr = function( txt ){
// HTML syntax dictactes that attribute cannot contain " and, that's a bit
// suprizing ' and &... they must be encoded.
// Google Chrome specially does not like ' in attributes... it freeezes in
// some cases.
  var map = Wiki.htmlizeAttrMap
  return txt.replace( /[&"']/g, function( ch ){ return map[ch] })
}

Wiki.dehtmlizeAttrMap = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'"
}

Wiki.dehtmlizeAttr = function( txt ){
// HTML syntax dictactes that attributes cannot contain " and, that's a bit
// suprizing ' and &... they must be encoded.
// Google Chrome specially does not like ' in attributes... it freeezes in
// some cases.
  var map = Wiki.dehtmlizeAttrMap
  return txt.replace( /(&.*;)/g, function( ch ){ return map[ch] })
}

Wiki.wikify = function( text ){
  text = Wiki.htmlize( text );
  var wiki_names = SW.wikiwords;
  // Soft urls, very soft, xyz.abc style
  // The pattern is tricky, took me hours to debug it
  // http://gskinner.com/RegExr/ may help
  var surl =
  /([\s>]|^)([^\s:=@#"([)\]>][a-z0-9.-]+\.[a-z]{2,4}[^\sA-Za-z0-9_!.;,<"]*[^\s:,<>"']*[^.@#\s:,<>'"]*)/g
  /*
   *  (([\s>]|^)             -- space or end of previous link or nothing
   *  [^\s:=@#"([)\]>]       -- anything but one of these
   *  [\w.-]+                -- words, maybe . or - separated/terminated
   *  \.[a-z]{2,4}           -- .com or .org or .xxx
   *  [^\sA-Za-z0-9_!.;,<"]* -- ? maybe
   *  [^\s:,<>"']*           -- not some separator, optional
   *  [^.@#\s:,<>'"]*        -- not . or @ or # terminated -- ToDo: broken
   *
   *  ToDo: must not match jh.robert@
   *  but should match simpliwiki.com/jh.robert@
   */
    text = text.replace( surl, function( m, p, u ){
      // u = u.replace( /&amp;/g, "&")
      // exclude some bad matches
      if( /[#.]$/.test( u) )return m
      if( u.indexOf( "..") >= 0 )return m
      return p
      + '<a href="' + Wiki.htmlizeAttr( "http://" + u) + '">'
      + u
      + '</a>'
    })

  // url are htmlized into links
  // The pattern is tricky, change with great care only
  var url = /([^>"\w]|^)([a-ik-z]\w{2,}:[^\s'",!<>)]{2,}[^.\s"',<>)]*)/g
    text = text
    .replace( url, function( m, p, u ){
      // exclude some matches
      //if( /[.]$/.test( u) )return m
      // Fix issue with terminating dot
      var dot = ""
      //if( ".".ends( u) ){
      if( u.indexOf( "." ) === u.length - 1 ){
        u = u.substr( 0, u.length - 1)
        dot = "."
      }
      u = u.replace( /&amp;/g, "&")
      return p + '<a href="' +  Wiki.htmlizeAttr( u) + '">' + u  + '</a>' + dot
    })

    // Change wiki words into links to simpliwiki
    var href = "http://simpliwiki.com/kudocracy/";
    text = text
    .replace( wiki_names, '$1<a class="wiki" href="' + href + '$2">$2</a>')

  // Fix some rare issue with nested links, remove them
  text = text.replace( /(<a [^>\n]+?)<a [^\n]+?>([^<\n]+?)<\/a>/g, '$1$2')
  
  return text;
}

// ---------------------------------------------------------------------------

function format_comment( text ){
// SimpliWiki style formating
  return Wiki.wikify( text );
}

function duration_label( duration ){
// Returns a sensible text info about a duration
  // Slight increase to provide a better user feedback
  //duration += 5000;
  var delta = duration / 1000;
  var day_delta = Math.floor( delta / 86400);
  if( isNaN( day_delta) )return "";
  if( day_delta < 0 ) return i18n( "in the future" );
  return (day_delta == 0
      && ( delta < 5
        && i18n( "just now")
        || delta < 60
        && i18n( "il y a ") + Math.floor( delta )
        + i18n( " seconds")
        || delta < 120
        && i18n( "1 minute")
        || delta < 3600
        && i18n( "il y a ") + Math.floor( delta / 60 )
        + i18n( " minutes")
        || delta < 7200
        && i18n( "about an hour")
        || delta < 86400
        && i18n( "il y a ") + Math.floor( delta / 3600 )
        + i18n( " hours")
        )
      || day_delta == 1
      && i18n( "a day")
      || day_delta < 7
      && i18n( "il y a ") + day_delta
      + i18n( " days")
      || day_delta < 31
      && i18n( "il y a ") + Math.ceil( day_delta / 7 )
      + i18n( " weeks")
      || day_delta >= 31
      && i18n( "il y a ") + Math.ceil( day_delta / 30.5 )
      + i18n( " months")
      ).replace( /^ /, ""); // Fix double space issue with "il y a "
}


function time_label( time, with_gmt ){
// Returns a sensible text info about time elapsed.
  //with_gmt || (with_gmt = this.isMentor)
  var delta = ((Kudo.now() + 10 - time) / 1000); // + 10 to avoid 0/xxx
  var day_delta = Math.floor( delta / 86400);
  if( isNaN( day_delta) )return "";
  if( day_delta < 0 ) return i18n( "in the future" );
  var gmt = !with_gmt ? "" : ((new Date( time)).toGMTString() + ", ");
  return gmt
    + (day_delta == 0
      && ( delta < 5
        && i18n( "just now")
        || delta < 60
        && i18n( "il y a ") + Math.floor( delta )
        + i18n( " seconds ago")
        || delta < 120
        && i18n( "1 minute ago")
        || delta < 3600
        && i18n( "il y a ") + Math.floor( delta / 60 )
        + i18n( " minutes ago")
        || delta < 7200
        && i18n( "about an hour ago")
        || delta < 86400
        && i18n( "il y a ") + Math.floor( delta / 3600 )
        + i18n( " hours ago")
        )
      || day_delta == 1
      && i18n( "yesterday")
      || day_delta < 7
      && i18n( "il y a ") + day_delta
      + i18n( " days ago")
      || day_delta < 31
      && i18n( "il y a ") + Math.ceil( day_delta / 7 )
      + i18n( " weeks ago")
      || day_delta >= 31
      && i18n( "il y a ") + Math.ceil( day_delta / 30.5 )
      + i18n( " months ago")
      ).replace( /^ /, ""); // Fix double space issue with "il y a "
}


function proposition_graphics(){
// Runs client side
  console.log( "Google pie" );
  google.load('visualization', '1.0', {'packages':['corechart']});
  google.setOnLoadCallback(drawChart);
  function drawChart(){

    var data;
    var options;

    // Create the data table.
    data = new google.visualization.DataTable();
    data.addColumn('string', 'Orientation');
    data.addColumn('number', 'Slices');
    data.addRows([
      ['agree',    graph_pie.agree],
      ['disagree', graph_pie.disagree],
      ['protest',  graph_pie.protest],
      ['blank',    graph_pie.blank]
    ]);

    // Set chart options
    options = { 'title':'Orientations', 'width':400, 'height':300 };

    // Instantiate and draw our chart, passing in some options.
    var chart = new google.visualization.PieChart( document.getElementById( 'orientation_chart_div' ) );
    chart.draw( data, options );

    data = new google.visualization.DataTable();
    data.addColumn( 'datetime', 'date' );
    data.addColumn( 'number' ) // , 'balance' );
    for( var ii = 0 ; ii < graph_serie.length ; ii++ ){
      graph_serie[ ii ][ 0 ] = new Date( graph_serie[ ii ][ 0 ] );
    }
    data.addRows( graph_serie );
    chart = new google.visualization.LineChart( document.getElementById( 'balance_chart_div' ) );
    options.title = "History";
    options.explorer = {};
    options.hAxis = { format: 'dd/MM HH:mm' };
    chart.draw( data, options );
  }
}


function page_proposition( page_name, name ){
// Focus on one proposition

  var proposition = Topic.find( name );
  if( !proposition )return [ _, "Proposition not found: " + name ];
  Session.current.proposition = proposition;
  var persona = Session.current.visitor;
  var result  = proposition.result;

  var is_tag = proposition.is_tag();
  var tag_label;
  var label;
  if( is_tag ){
    tag_label = proposition.label;
    label = tag_label.substring( 1 );
  }else{
    label = proposition.label;
    tag_label = "#" + label;
  }

  // Graph preparation
  var graph_pie = {
    agree: result.agree(),
    disagree: result.disagree(),
    protest: result.protest(),
    blank: result.blank()
  };
  var graph_serie = [ [ proposition.timestamp, 0 ] ];
  var balance = 0;

  // Make body
  var buf = [];

  buf.push( '<h1>' + (is_tag ? "Tag " : "" )
  + emoji( proposition.result.orientation() ) + proposition.label + '</h1><br><br>' );
  
  var comment = proposition.comment();
  if( comment ){
    buf.push( '<h3>' + format_comment( comment.text ) + '</h3><br><br>' ) 
  }

  // Twitter tweet button, if proposition and no visitor (else use vote_menu())
  if( !is_tag && !Session.current.visitor ){
    buf.push( '<a href="https://twitter.com/intent/tweet?button_hashtag='
      + label
      + '&hashtags=kudocracy,vote,'
      + proposition.tags_string().replace( / /g, "," ).replace( /#/g, "")
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet ' + label + '</a>'
    );
  }

  // Summary
  buf.push( '<br><br>' + proposition_summary( result, "div" ) + '<br>' );

  if( is_tag ){
    buf.push( "<br>" + proposition.propositions().length + " "
      + link_to_page( "propositions", label, "propositions" ) + "<br>"
    )
  }

  // List of tags, with link to propositions
  var tmp = proposition.filter_string( persona );
  buf.push( filter_label( tmp, "propositions" ) );

  // Source, since, age, last change...
  if( tmp = proposition.source() ){
    if( tmp.indexOf( "://" ) !== -1 ){
      tmp = '<a href="' + tmp + '">' + tmp + '</a>';
    }
    buf.push( "<br>source " + tmp );
  }
  buf.push( "<br>since " + time_label( proposition.timestamp ) );
  //buf.push( "<br>age " + duration_label( proposition.age() ) );
  buf.push( "<br>last change " + time_label( proposition.time_touched ) );

  // Last vote
  var votes_log = proposition.votes_log() || [];
  if( votes_log.length ){
    var last_vote_value = votes_log[ votes_log.length -1 ];
    buf.push( '<br>last vote ' + time_label( last_vote_value.snaptime ) );
    if( last_vote_value.entity.privacy() === "public" ){
      buf.push( ' <em>' + emojied( last_vote_value.entity.orientation() ) + '</em>' );
      buf.push( ' ' + link_to_page( "persona", last_vote_value.persona_label ) );
      if( last_vote_value.delegation !== Vote.direct ){
        buf.push( ' <dfn>(via '
          + link_to_page( last_vote_value.delegation.agent.label, "persona" )
          + ')</dfn>'
        );
      }
    }
  }

  // End in...
  buf.push( "<br>end in " + duration_label( proposition.expire() - Kudo.now() ) );

  // Vote menu
  if( Session.current.visitor ){
    var vote_entity = Vote.find( Session.current.visitor.name + "." + proposition.name );
    if( vote_entity ){
      buf.push( '<br><br>you: '
        + '<em>' + emojied( vote_entity.orientation() ) + "</em> "
        + "<dfn>(" + vote_entity.privacy() + ")</dfn>"
        + ( vote_entity.is_direct()
          ? ""
          :  "<dfn>(via " + link_to_page( "persona", vote_entity.delegation().agent.label ) + ")</dfn>" )
        + ", for " + duration_label( vote_entity.expire() - Kudo.now() )
      );
      buf.push( vote_menu( vote_entity, true /* with comment */ ) );
    }else{
      buf.push( vote_menu( Session.current.visitor, proposition ) );
    }
    buf.push( "<br>" );
  }

  // Graph, pie
  buf.push( '<div id="orientation_chart_div"></div>' );
  buf.push( '<div id="balance_chart_div"></div>' );

  // Votes
  var votes = proposition.votes_log() || [];
  buf.push( "<br><div><h2>Votes</h2><br>" );
  //buf.push( "<ol>" );
  votes.forEach( function( vote_value ){
    var was = null;
    if( vote_value.entity.updates.length > 1 ){
      was = vote_value.entity.updates[ vote_value.entity.updates.length - 1 ];
    }
    if( was ){ was = was.orientation; }
    if( was === "agree" ){
      balance--;
    }else if( was === "disagree" || was === "protest" ){
      balance++;
    }
    var now = vote_value.orientation;
    if( now === "agree" ){
      balance++;
    }else if( now === "disagree" || now === "protest" ){
      balance--;
    }
    graph_serie.push( [
      vote_value.snaptime,
      balance
    ] );
    if( vote_value.delegation          === Vote.direct
    && vote_value.privacy              === Vote.public
    && vote_value.orientation          !== Vote.neutral
    && !vote_value.entity.expired()
    && vote_value.entity.privacy()     === Vote.public
    && vote_value.entity.orientation() !== Vote.neutral
    && !vote_value.entity.persona.expired()
    ){
      buf.push( "<br>" );
      buf.push(
        '<em>' + emojied( vote_value.orientation ) + "</em> "
        + link_to_page( "persona", vote_value.persona_label )
        + " <small><dfn>" + time_label( vote_value.snaptime ) + "</dfn></small>"
      );
      if( vote_value.comment_text ){
        buf.push( ' ' + format_comment( vote_value.comment_text ) );
      }
      // buf.push( "</li>" );
    }
  });
  buf.push( "</div><br>" );

  // Footer
  buf.push( page_footer() );

  // Header
  var r = [
    page_style()
    + '<script type="text/javascript" src="https://www.google.com/jsapi"></script>'
    + '<script type="text/javascript">'
    //+ '\nvar proposition = ' + proposition.json_value()
    + '\nvar graph_pie = ' + JSON.stringify( graph_pie )
    + '\nvar graph_serie = ' + JSON.stringify( graph_serie )
    + '\n' + proposition_graphics + '; proposition_graphics();'
    + '</script>',
    [ page_header(
      _,
      link_to_twitter_filter( tag_label ),
      link_to_page( "propositions" )
    ) ]
  ];
  r[1] = r[1].concat( buf );
  return r;
}

/*
 *  The REPL Read Eval Print Loop commands of this Test/Debug UI
 */

var http_repl_commands = {};

function print_entities( list ){
  // Chronological order
  var sorted_list = list.sort( function( a, b ){
    var time_a = a.time_touched || a.timestamp;
    var time_b = b.time_touched || b.timestamp;
    var order = a - b;
    return order ? order : a.id - b.id;
  });
  sorted_list.forEach( function( entity ){
    printnl( "&" + entity.id + " " + entity
    + " " + pretty( entity.value() ) );
  });
}

var last_http_repl_id = null;

Kudo.extend( http_repl_commands, {

  cls: function(){ cls(); },
  noop: function(){},

  help: function(){
    var tmp = [
      "<h2>Help, syntax</h2>command parameter1 p2 p3...",
      "In parameters, &nnn is entity with specified id",
      "  & alone is last specified entity",
      "  +key:val adds entry in a hash object",
      "  +something adds entry in an array",
      "  [] and {} are empty tables/objects",
      "  , (comma) asks for a new table/object",
      "  true, false, _, null work as expected",
      "!xxx cmd p1 p2 p3 -- register as macro",
      "!xxx -- run previously registered macro",
      "! -- repeat previous macro",
      "<h2>Examples</h2>",
      link_to_command( "page visitor @jhr" ),
      "tagging & [] , +#tagX +#tagY  -- tagging with two lists",
      "delegation &40 +#tagX &23 +inactive:true",
      "<h2>Commands</h2>",
      link_to_command( "cls" ) + " -- clear screen",
      link_to_command( "page" ) + " -- list available pages",
      "page name p1 p2 ... -- move to said page",
      link_to_command( "noop" ) + " -- no operation, but show traces",
      link_to_command( "version" ) + " -- display version",
      link_to_command( "debug" ) + " -- switch to debug mode",
      link_to_command( "ndebug" ) + " -- switch to no debug mode",
      link_to_command( "dump" ) + " -- dump all entities",
      "dump type -- dump entities of specified type",
      link_to_command( "dump &" ) + "id -- dump specified entity",
      link_to_command( "value &" ) + "id -- display value of entity",
      link_to_command( "debugger &" ) + "id -- inspect entity in native debugger",
      link_to_command( "log &" ) + "id -- dump history about entity",
      link_to_command( "effects &" ) + "id -- dump effects of involed change",
      "login -- create user if needed and set current",
      "change_vote &id privacy orientation -- change existing vote",
      "change_proposition text #tag text #tag... -- change proposition",
      "delegate &id privacy duration -- change delegation"
    ];
    for( var v in replized_verbs ){
      tmp.push( v + " " + replized_verbs_help[ v ] );
    }
    print( tmp.join( "\n" ) );
  },

  page: page,

  debug: function(){ de = true; Kudo.debug_mode( true ); },
  ndebug: function(){ de = false; Kudo.debug_mode( false ); },

  dump: function( entity ){
    if( arguments.length ){
      if( entity.is_entity ){
        Kudo.dump_entity( entity, 2 );
      }else{
        var type = " " + entity.toLowerCase();
        var names = " change expiration persona source topic tagging tweet"
        + " vote result transition delegation membership visitor action ";
        var idx = names.indexOf( type );
        if( idx === -1  ){
          printnl( "Valid types:" + names );
        }else{
          var sep = names.substring( idx + 1 ).indexOf( " " );
          var found = names.substring( idx + 1, idx + sep + 1 );
          found = found[ 0 ].toUpperCase() + found.substring( 1 );
          printnl( "dump " + found );
          var entities = vote[ found ].all;
          var list = [];
          for( var item in entities ){
            list.push( entities[ item ] );
          }
          if( !list.length ){
            Kudo.AllEntities.forEach( function( item ){
              if( item && item.type === found ){
                list.push( item );
              }
            })
          }
          print_entities( list );
        }
      }
    }else{
      Kudo.dump_entities();
    }
  },

  log: function( entity ){
    if( entity.effect ){
      entity = entity.effect;
    }else if( entity.to ){
      entity = entity.to;
    }
    var all = Kudo.AllEntities;
    var list = [];
    all.forEach( function( e ){
      if( e === entity
      || (e && e.to === entity)
      || (e && e.effect === entity)
      ){
        list.push( e );
      }
    } );
    print( "Log " + entity );
    print_entities( list );
  },

  effects: function( entity ){
    var change = entity.change || entity;
    var list = [ change ];
    var cur = change.to;
    while( cur ){
      list.push( cur );
      cur = cur.next_effect;
    }
    print( "Effects " + entity );
    print_entities( list );
  },

  value: function( entity ){
    printnl( entity ? pretty( entity.value(), 3 ) : "no entity" );
  },


  change_vote: function( vote_entity, privacy, orientation, duration, comment ){

    // ToDo: move this into some page_xxx()
    redirect_back( 2 );

    // Figure out parameters, maybe from pending http query
    var proposition = null;
    var query = PendingResponse.query;

    // Find vote
    var vote_id = query.vote_id;
    if( !vote_entity ){
      if( !vote_id ){
        printnl( "Vote not found" );
        return;
      };
      vote_entity = Vote.find( vote_id );
    }

    // Parse privacy
    privacy = privacy || query.privacy;
    if( Array.isArray( privacy ) ){
      privacy = privacy[0];
    }
    if( !privacy
    ||   privacy === "idem"
    ||   privacy === "privacy"
    ||   privacy === ( vote_entity && vote_entity.privacy() )
    || " public secret private ".indexOf( " " + privacy + " " ) === -1
    ){
      privacy = _;
    }

    // Parse orientation
    orientation = orientation || query.orientation;
    if( Array.isArray( orientation ) ){
      orientation = orientation[0];
    }
    if( !orientation
    ||   orientation === "idem"
    ||   orientation === "orientation"
    ||   orientation === ( vote_entity && vote_entity.orientation() )
    || " agree disagree protest blank neutral ".indexOf( " " + orientation + " " ) === -1
    ){
      orientation = _;
    }

    // Parse duration
    duration = duration || query.duration;
    if( Array.isArray( duration ) ){
      duration = duration[0];
    }
    if( !duration
    ||   duration === "idem"
    ||   duration === "duration"
    ){
      duration = _;
    }else if( typeof duration === "string" ){
      duration = ({
        "one year":  Kudo.ONE_YEAR,
        "one month": Kudo.ONE_MONTH,
        "one week":  Kudo.ONE_WEEK,
        "24 hours":  Kudo.ONE_DAY,
        "one hour":  Kudo.ONE_HOUR
      })[ duration ]
    }
    if( !duration ){ duration = _; }

    // Parse comment
    comment = comment || query.comment;
    if( Array.isArray( comment ) ){
      comment = comment[0];
    }
    if( !comment
    ||   comment === "idem"
    ||   comment === "comment"
    ||   comment === ( vote_entity && vote_entity.comment() && vote_entity.comment().text )
    ){
      comment = _;
    }

    // Something changed?
    if( !privacy && !orientation && !duration &!comment ){
      printnl( "No change" );
      return;
    }

    // Either a brand new vote
    if( !vote_entity ){
      var idx_dot = vote_id.indexOf( "." )
      var persona = Persona.find( vote_id.substring( 0, idx_dot ) );
      if( !persona || persona.type !== "Persona" ){
        printnl( "Persona not found" );
        return;
      }
      proposition = Topic.find( vote_id.substring( idx_dot + 1 ) );
      if( proposition && proposition.type !== "Topic" ){
        printnl( "Proposition not found" );
        return;
      }
      Session.current.proposition = proposition;
      Ephemeral.inject( "Vote", {
        persona:     persona,
        proposition: proposition,
        privacy:     ( privacy || _ ),
        orientation: ( orientation || _ ),
        duration:    duration
      });
      printnl( "New vote of " + persona + " on " + proposition );
      //redirect( "proposition%20" + proposition.label );

    // Or a change to an existing vote
    }else{
      if( privacy || duration || orientation ){
        // Adjust duration to make a renew
        if( duration ){
          duration += vote_entity.age();
        }
        Ephemeral.inject( "Vote", {
          id_key:      vote_entity.id,
          privacy:     ( privacy || _ ),
          orientation: ( orientation || _ ),
          duration:    duration
        });
        printnl( "Changed vote " + pretty( vote_entity ) );
      }
      if( comment ){
        Ephemeral.inject( "Comment", {
          vote: vote_entity,
          text: comment
        });
        printnl( "Comment changed " + pretty( vote_entity ) );
        // If change to comment only, go to page about proposition
        if( !privacy && !duration && !orientation ){
          redirect( "proposition " + vote_entity.proposition.label );
        }
      }
    }
    return;
  },

  change_delegation: function( delegation_entity, privacy, duration ){
    // ToDo: move this into some page_xxx()
    redirect_back();
    var query = PendingResponse.query;

    // Parse privacy
    privacy = privacy || query.privacy;
    if( privacy === "idem"
    ||  privacy === "privacy"
    ){
      privacy = null;
    }
    if( privacy
    && " public secret private ".indexOf( " " + privacy + " " ) === -1
    ){
      privacy = null;
    }
    if( !privacy ){ privacy = _; }

    // Parse duration
    duration = duration || query.duration;
    if( duration === "idem"
    || duration === "duration"
    ){
      duration = null;
    }
    if( duration ){
      if( typeof duration === "string" ){
        duration = ({
          "one year":  Kudo.ONE_YEAR,
          "one month": Kudo.ONE_MONTH,
          "one week":  Kudo.ONE_WEEK,
          "24 hours":  Kudo.ONE_DAY,
          "one hour":  Kudo.ONE_HOUR
        })[ duration ]
      }
    }
    if( !duration ){ duration = _; }

    // Something changed?
    if( !privacy && !duration ){
      printnl( "No change" );
      return;
    }

    // Adjust duration to make a renew
    if( duration ){
      duration += delegation_entity.age();
    }
    Ephemeral.inject( "Delegation", {
      id_key:      delegation_entity.id,
      privacy:     privacy,
      duration:    duration
    });
    printnl( "Changed delegation " + pretty( delegation_entity ) );

    return;
  },

  login: function( name ){
    name = name.trim().replace( /[^A-Za-z0-9_]/g, "" );
    if( name[0] !== "@" ){ name = "@" + name };
    if( name.length < 4 )return redirect( "login" );
    var lower_name = name.toLowerCase();
    // Create persona if first visit, respect user provided case
    if( !( Session.current.visitor = Persona.find( lower_name ) ) ){
      Ephemeral.inject( "Persona", { label: name } );
      Session.current.visitor = Persona.find( lower_name );
    }
    // ToDo: set cookies for SimpliWiki
    if( Session.current.filter === "" || Session.current.filter === "#hot" ){
      Session.current.set_filter( "new" );
    };
    if( Session.current.previous_page[0] === "proposition" ){
      Session.current.current_page = Session.current.previous_page;
      redirect_back( 2 );
    }else if( Session.current.previous_page[0] === "propositions" ){
      Session.current.current_page = Session.current.previous_page;
      redirect_back( 2 );
    }else{
      redirect( "visitor" );
    }
  },


  change_proposition: function( name ){

    // Sanitize, extract tags, turn whole text into valid potential tag itself
    var text = Array.prototype.slice.call( arguments ).join( " " );

    redirect_back();
    // Could be a search, a delegate or a propose coming from page_propositions

    // Search
    if( text.toLowerCase().indexOf( "search" ) === 0 ){
      text = text.substring( "search".length );
      Session.current.set_filter( text || "all" );
      return;
    }

    // Delegate
    if( text.toLowerCase().indexOf( "delegate" ) === 0 ){
      text = text.substring( "delegate".length );
      if( !Session.current.visitor ){
        return;
      }
      if( !Session.current.has_filter() ){
        return;
      }
      var agent_name = text
      .replace( /#[A-Za-z][_0-9A-Za-z]*/g, "" )
      .replace( /[^A-Za-z0-9_]/g, "" );
      if( !agent_name ){
        return;
      }
      var agent = Persona.find( "@" + agent_name );
      if( !agent ){
        return;
      }
      text = text.replace( agent_name, "" ).trim();
      if( text.length ){
        Session.current.set_filter( text );
      }
      if( !Session.current.filter_tags.length ){
        return;
      }
      Ephemeral.inject( "Delegation", {
        persona: Session.current.visitor,
        agent:   agent,
        tags:    Session.current.filter_tags
      });
    }

    if( text.toLowerCase().indexOf( "propose " ) === 0 ){
      text = text.substring( "propose ".length );
    }

    // Propose

    // Collect list of tags, inject user's name as first tag
    var tags = [ "#"
      + ( Session.current.visitor && Session.current.visitor.label || "@anonymous" )
      .substring( 1 )
    ];
    text = text.replace( /#[A-Za-z][_0-9A-Za-z]*/g, function( tag ){
      // if( tag === "tag")return "";
      tags.push( tag );
      return ""
    } );

    // If not tags at all but some space, assume list of tags
    if( tags.length === 1 && text.indexOf( " " ) !== -1 ){
      text = text.replace( /[A-Za-z][_0-9A-Za-z]*/g, function( tag ){
        // if( tag === "tag")return "";
        tags.push( tag );
        return ""
      } );
    }

    // Tags were removed, process invalid characters
    text
    .replace( /  /g, " " ).trim()  // extra spaces
    .replace( /[^A-Za-z0-9_]/g, "_" ) // _ where non alphanum
    .replace( /__/g, "_" ) // remove extra _
    .replace( /^_/, "" )
    .replace( /_$/, "" );

    // if nothing remains, use first tag to name the proposition
    if( text.length < 2 ){
      if( ( text = tags[0] ).length < 2 ){
        printnl( "Not a valid proposition name" );
        return;
      }
      // Remove first # unless coming from the tags page
      if( !Session.current.current_page[0] === "tags" ){
        text = text.substring( 1 );
      }
    }

    var changes = [];
    var tag_entities = [];
    tags.forEach( function( tag ){
      if( tag.length < 3 )return;
      var entity = Topic.find( tag );
      if( entity ){
        tag_entities.push( entity );
      }else{
        // Filter out reserved tags
        if( Topic.reserved( tag ) )return;
        changes.push( function(){
          Ephemeral.inject( "Topic", {
            label:   tag,
            persona: Session.current.visitor
          } );
        });
        changes.push( function(){
          tag_entities.push( Topic.find( tag ) );
        })
      }
    });

    // Creation of topic or update with addition of tags
    var proposition = Topic.find( text );
    if( !proposition ){
      changes.push( function(){
        Ephemeral.inject( "Topic", {
          label:   text,
          tags:    tag_entities,
          persona: Session.current.visitor
        } );
      } );
    }else{
      changes.push( function(){
        Ephemeral.inject( "Tagging", {
          proposition: proposition,
          tags:        tag_entities,
          persona:     Session.current.visitor
        } );
      });
    }

    // Process change. ToDo: async
    Ephemeral.inject( changes );

    // Update filter to match topic
    Session.current.proposition = proposition || Topic.find( text );
    var new_filter = [];
    tag_entities.forEach( function( tag_entity, index ){
      // Skip user name
      if( index === 0 )return;
      new_filter.push( tag_entity.label );
    });
    Session.current.set_filter( new_filter.join( " " ) );
  },

  debugger: function( e, e2, e3, e4 ){
    var p  = pretty( e , 2 );
    var p2 = pretty( e2, 2 );
    var p3 = pretty( e3, 2 );
    var p4 = pretty( e4, 2 );
    var v  = value( e , 100 );
    var v2 = value( e2, 100 );
    var v3 = value( e3, 100 );
    var v4 = value( e4, 100 );
    debugger;
  },

  version: function(){ printnl( "Kudocracy Version: " + Kudo.version ); }
} );

var http_repl_macros = {};
var last_http_repl_macro = "help";
var http_repl_history = [];

function start_http_repl(){
  var port = process.env.PORT || "8080";
  http.createServer( HttpQueue.put.bind( HttpQueue ) ).listen( port );
  l8.task( function(){ this
    .step( function(){ trace( "Web test UI is running on port " + port ); })
    .repeat( function(){ this
      .step( function(){ input( "" ); } )
      .step( function( r ){
        printnl( link_to_command( r ) );
        var input = r;
        // Handle !macros
        if( input[0] === "!" ){
          var idx_space = input.indexOf( " " );
          // !macro -- run it
          if( idx_space === -1 ){
            if( input === "!" ){
              input = last_http_repl_macro;
            }else{
              input = http_repl_macros[ input ];
            }
            if( !input ){ input = "help"; }
            last_http_repl_macro = input;
          }else{
            http_repl_macros[ input.substring( 0, idx_space - 1 ) ]
            = input.substring( idx_space + 1 );
            input = input.substring( idx_space + 1 );
          }
        }
        try{
          // Parse command line, space delimits tokens
          var tokens = input.split( " " );
          // First token is command name
          var cmd = tokens[0];
          // Other tokens describe the arguments
          var args = tokens.slice( 1 );
          var args2 = [];
          var obj = null;
          args.forEach( function( v, idx ){
            var front = v[0];
            var need_push = false;
            // +something means something is added to an array or an object
            if( front === "+" ){
              need_push = true;
              v = v.substring( 1 );
            }else{
              obj = null;
            }
            var sep = v.indexOf( ":" );
            var key = ( sep === -1 ) && v.substring( 0, sep - 1 );
            var val = ( sep === -1 ) && v.substring( sep + 1 );
            if( val === "true"  ){ val = true; }
            if( val === "false" ){ val = false; }
            if( val === "_"     ){ val = _; }
            if( val === "null"  ){ val = null; }
            // &something is the id of an entity, & alone is last id
            if( front === "&" ){
              var id;
              if( v.length === 1 ){
                id = last_http_repl_id;
              }else{
                id = v.substring( 1 );
                if( parseInt( id ) ){
                  id = parseInt( id );
                }
                if( id < 10000 ){
                  id += 10000;
                }
                last_http_repl_id = id;
              }
              v = Kudo.AllEntities[ id ];
            }
            // Handle +
            if( need_push ){
              // If neither [] nor {} so far, start it
              if( !obj ){
                // start with { n: v } when +something:something is found
                if( key ){
                  obj = {};
                  obj[ key ] = val;
                  v = obj;
                // start with [ v ] if no : was found
                }else{
                  v = obj = [ v ];
                }
              // If previous [] or {}
              }else{
                if( !key ){
                  obj.push( v )
                }else{
                  obj[ key ] = val;
                }
                v = null;
              }
            }
            // If [] or {} then add to that new object from now on
            if( v === "[]" ){
              v = obj = [];
            }else if( v === "{}" ){
              v = obj = {};
            }else if( v === "," ){
              v = obj = null;
            }
            if( v ){ args2.push( v ) }
          });
          var code = http_repl_commands[ cmd ];
          if( code ){
            code.apply( cmd, args2 );
            http_repl_history.unshift( r );
          }else{
            printnl( "Enter 'help'" );
          }
        }catch( err ){
          printnl( "Error " + err );
          trace( "Http REPL error: ", err, err.stack );
        }
      });
    })
  });
}


function main(){

  trace( "Welcome to Kudocracy -- Liquid demo...cracy" );

  //Ephemeral.force_bootstrap = true;
  Kudo.debug_mode( de = false );
  Ephemeral.start( bootstrap, function( err ){
    if( err ){
      trace( "Cannot proceed", err, err.stack );
      //process.exit( 1 );
      return;
    }
    // Let's provide a frontend...
    trace( "READY!" );
    start_http_repl();
  } );
}

// Hack to get sync traces && http REPL outputs
if( true || de ){
  var fs = require('fs');
  var old = process.stdout.write;

  process.stdout.write = function (d) {
    de && fs.appendFileSync( "./trace.out", d);
    print( d );
    return old.apply(this, arguments);
  }
}

l8.begin.step( main ).end;
//l8.countdown( 200 );
