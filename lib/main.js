// main.js
//   reactive liquid democracy
//
// "When liquid democracy meets Twitter..."
//
// april 2014 by @jhr
// june 2014 by @jhr, move from l8/test/votes.js, 6800 LOC
//
// This file is included by the server side application (ui1.js) and also
// by the browser when the application run in "dual mode", ie also on the
// client side (ui1client.js). In that case, some actions are forwarded to
// the server instead of running locally and ephemeral changes on the server
// side are sent to all the clients to keep them updated.
// ToDo: implement this

"user strict";

var Kudo = { store: "vote.json.log" }; // ToDo: "file://vote.json.log"

// Inject the "ephemeral" vocabulary into the Kudo scope.
require( "./ephemeral.js" )( Kudo );

// Extract stuff from the Kudo scope for readability/convenience
var l8        = Kudo.l8;
var Event     = Kudo.Event;
var Ephemeral = Kudo.Ephemeral;

// My de&&bug() and De&&mand() darlings
var De      = true;  // For De&&mand() style asserts
var de      = false; // For de&&bug() style traces
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
var plasma  = water.plasma;
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
 *  Individual's label is the twitter name of some twitter account, possibly an
 *  account bound to a "true human person" or a fake or whatever emerges (AI,
 *  ...). One individual, one vote.
 *
 *  Groups are personas that don't vote. However, groups have orientations like
 *  individuals. As a result, one can delegate to a group. The orientation of
 *  a group is the consolidation of the orientations of the group members,
 *  where each member's orientation is weighted according to the number of
 *  members in it (group members can be groups themselves).
 *  ToDo: Implement groups
 *
 *  Group's label is the twitter name of some twitter account. As a result,
 *  the management of the membership is done by whoever controls that
 *  twitter account. To add a member, follow that member.
 *  ToDo: implement group membership in sync with twitter account
 *
 *  Attributes:
 *    - Entity/id
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
  assert( this.name[0] === "@" || options.role === Persona.group );

  // Persona entities have a @xxx id and can expire, sometimes early
  var persona = this.register( this.name );
  if( !persona )return null;
  var plasma = this.plasma( persona );

  this.role             = options.role || Persona.individual;
  this.members          = plasma( [] );
  this.memberships      = plasma( [] );
  this.delegations      = plasma( [] );
  this.delegations_from = plasma( [] );
  this.votes            = plasma( [] );
  
  // ToDo: test update()
  if( this.is_update() )return persona.update( this );
  
  // Remember list of delegation filters that involves this agent
  this._delegation_expertizes = [];

  // ToDo: total number of votes, including votes for others.
  // This would make it easier to detect "super delegates"
  this.count_indirections = 0;
  
  // Increase default expiration
  this.duration = options.duration || Kudo.ONE_YEAR;

  // Index, for faster access
  this._votes_indexed_by_proposition = {};
}

// Persona roles
Persona.individual = "individual";
Persona.group      = "group";

Persona.prototype.is_group      = function(){ return this.role === "group"; };
Persona.prototype.is_individual = function(){ return !this.is_group();      };


Persona.find = function( key ){
// Keys are case insensitive on twitter, ie @MyName === @myname
  var entity = Persona.basic_find( namize( key ) );
  if( entity ){
    entity.check_identity();
  }
  return entity;
};


Persona.prototype.valid = function(){
  this.check_identity();
  return !this.expired() ? this : null;
};


Persona.prototype.touch = function(){
  this.check_identity();
  var delay = this.expire() - ( this.time_touched = Kudo.now() );
  // If touched after mid life, extend duration to twice the current age
  if( delay < this.age() / 2 ){
    this.renew( this.age() * 2 );
  }
  Persona.super.prototype.touch.call( this );
};


Persona.prototype.get_vote_on = function( proposition ){
// If there is a vote by persona on said topic, return it, or null/undef
  De&&mand( proposition.is_a( Topic ) );
  // Lookup in cache
  var found_vote = this._votes_indexed_by_proposition[ proposition.key ];
  if( typeof found_vote !== "undefined" ){
    return Vote.valid( found_vote );
  }
  // Not cached, scan all votes
  this.votes().every( function( vote ){
    if( Vote.valid( vote ) && vote.proposition === proposition ){
      found_vote = vote;
      return false;
    }
    return true;
  });
  if( found_vote ){
    debugger;
    trace( "BUG? unexpected vote on " + proposition + " of " + this );
  }
  // Update cache
  this._votes_indexed_by_proposition[ proposition.key ] = found_vote || null;
  return found_vote;
};


Persona.prototype.get_non_neutral_vote_on = function( proposition ){
  var vote = this.get_vote_on( proposition );
  if( !vote )return vote;
  return vote.is_neutral() ? null : vote;
};


Persona.prototype.get_orientation_on = function( proposition ){
// Return non neutral orientation on topic if it exits, or else undefined
  De&&mand( proposition.is_a( Topic ) );
  var vote = this.get_non_neutral_vote_on( proposition );
  return vote && vote.orientation();
};


Persona.prototype.get_agent_orientation_on = function( proposition ){
// Return non neutral orientation on topic if it exits, or else undefined
  De&&mand( proposition.is_a( Topic ) );
  var vote = this.get_non_neutral_vote_on( proposition );
  if( !vote )return null;
  return vote.orientation();
};


Persona.prototype.trust_on = function( proposition ){
// True if some agent vote on the proposition
  return this.agents( proposition, true /* check */ );
};


Persona.prototype.trust_level_on = function( proposition ){
// trust level increases when more agents voted on proposition
  return this.agents( proposition ).length;
};


Persona.prototype.add_delegation = function( delegation, loop ){
// Called when a delegation is created. This will also add the reverse
// relationship (delegation_from), on the agent's side.

  if( !Delegation.valid( delegation ) )return this;
  De&&mand( delegation.persona === this );
  
  var delegations = this.delegations() || [];
  
  if( delegations.indexOf( delegation ) !== -1 ){
    trace( "BUG? Delegation already added " + delegation
      + ", persona: " + this
      + ", agent: " + delegation.agent
    );
    return this;
  }
  
  var now  = Ephemeral.compact( delegations );
  
  now.push( delegation );
  
  // Sort, based on current number of votes for that filter so far
  // This assumes that the less votes, the more specific the filter is
  now = now.sort( function( a, b ){
    return a._delegation_expertize._delegation_filter.count_votes
    -      b._delegation_expertize._delegation_filter.count_votes;
  });
  
  de&&bug( "Add delegation " + delegation
   + " for persona " + this 
   + " for topics tagged " + pretty( delegation.tags )
   + " to agent " + delegation.agent
  );
  
  if( !loop ){
    delegation.agent.add_delegation_from( delegation, true );
  }
  return this;
};


Persona.prototype.agents = function( proposition, check ){
// Return alpha sorted list of all agents, among all delegations
  var checked = false;
  var list = [];
  Ephemeral.every( this.delegations(), function( delegation ){
    var agent = Persona.valid( delegation.agent );
    if( !agent )return true;
    // Only when agent voted on specified proposition
    if( proposition ){
      var vote = agent.get_non_neutral_vote_on( proposition );
      if( !vote )return;
      if( vote.is_neutral() )return true;
    }
    if( check ){
      checked = true;
      return false;
    }
    if( list.indexOf( agent ) !== -1 )return true;
    list.push( agent );
    return true;
  });
  if( check )return checked;
  var sorted_list = list.sort( function( a, b ){
    return a.name > b.name ? 1 : -1;
  });
  return sorted_list;
};


Persona.prototype.some_agent_on = function( proposition ){
// True if some agent voted on proposition
  return this.agents( proposition, true /* check */ );
};


Persona.prototype.get_orientation_on = function( proposition ){
  var vote = this.get_non_neutral_vote_on( proposition );
  if( !vote )return Vote.neutral;
  return vote.orientation();
};


Persona.prototype.add_delegation_from = function( delegation, loop ){
// Called by Persona.add_delegation() to sync the agent side of the
// one to one bidirectional relation.
  if( !Delegation.valid( delegation ) )return this;
  De&&mand( delegation.agent === this );
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
   + " for topics tagged " + pretty( delegation )
   + " from persona " + delegation.persona
  ); 
  this.delegations_from( now );
  if( !loop ){
    delegation.persona.add_delegation( delegation, true );
  }
  return this;
};


Persona.prototype.vote_for_others = function( vote ){
// When a persona was given delegations, her vote may cascade into votes for
// other personas, on the same proposition.
  De&&mand( vote.persona === this );
  var persona     = this;
  De&&mand( !persona.expired() );
  var orientation = vote.orientation();
  var proposition = vote.proposition;
  var delegations_from = this.delegations_from();
  if( !delegations_from.length )return this;
  de&&bug(
    "Persona " + persona + " votes " + orientation
    + " on proposition " + vote.proposition
    + " for at most " + delegations_from.length + " other personas"
  );
  //debugger;
  var seen_personas = {};
  var count_personas = 0;
  Ephemeral.each( delegations_from, function( delegation ){
    if( seen_personas[ delegation.persona.id ] )return;
    if( !delegation.inactive() && proposition.is_tagged( delegation.tags ) ){
      if( vote.vote_using_delegation( delegation ) ){
        seen_personas[ delegation.persona.id ] = true;
        count_personas++;
        de&&bug(
          "Vote " + count_personas + " done, by " + persona + " "+ orientation
          + " on proposition " + vote.proposition
          + " on behalf of " + delegation.persona 
        );
      }
    }
  });
  de&&bug(
    "Persona " + persona + " did vote " + orientation
    + " on proposition " + vote.proposition
    + " for " + count_personas + " other personas"
  );
  return this;
};


Persona.prototype.get_topic = function(){
  var id = this.id.substring( 1 ); // Remove @
  var topic = Topic.find( '#' + id );
  return topic;
};

Persona.prototype.get_alias = function(){
// Optional "alias" is @xxx at start of persona's topic's comment, if any
  var alias = this._cached_alias;
  if( typeof alias !== "undefined" )return alias;
  var topic = this.get_topic();
  if( !topic ){
    alias = "";
  }else{
    alias = topic.get_comment_text();
    if( alias[0] === "@" ){
      var sp_idx = alias.indexOf( " " );
      if( sp_idx < 2 ){
        alias = "";
      }else{
        alias = alias.substring( 0, sp_idx );
        // Hack: use _ to input space
        alias = alias.replace( /_/g, " " );
        // Alias cannot be the name of another persona
        if( Persona.find( alias ) ){
          alias = "";
        }
      }
    }else{
      alias = "";
    }
    // Get rid of useless alias when it is the same as the persona's label
    if( alias === this.label ){
      alias = "";
    }
  }
  this._cached_alias = alias;
  return alias;
};


Persona.prototype.has_tag = function( tag_name ){
  var topic = this.get_topic();
  if( !topic )return false;
  return topic.has_tag( tag_name, this );
};


Persona.prototype.is_domain = function(){
// A Persona is a domain if the persona exists in the main machine and has
// a #domain tag;
  var persona_label = this.label;
  var machine = Ephemeral.Machine.current;
  Ephemeral.Machine.main.activate();
  var persona = Persona.find( persona_label );
  var is_domain
  = persona && !persona.is_abuse() && persona.has_tag( "#domain" );
  machine.activate();
  return is_domain;
};


Persona.prototype.is_abuse = function(){
// Some persona get ostracized, when a matching tag is voted "protest"
  var topic = this.get_topic();
  return topic && topic.is_abuse();
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
  var every_dont = Ephemeral.every( this.delegations, function( delegation ){
    var does_apply = delegation.delegates_to( agent, tags, seen );
    if( does_apply ){
      trace( "applicable delegation: " + delegation );
    }
    return !does_apply;
  });
  return !every_dont; // ie some delegation does apply
};


Persona.prototype.get_comment = function( allow_abuser ){
  var topic = Topic.find( this.id.replace( "@", "#" ) );
  if( !topic )return null;
  return topic.get_comment( allow_abuser );
};


Persona.prototype.get_comment_author = function( allow_abuser ){
  var comment = this.get_comment( allow_abuser );
  if( !comment )return Persona.valid( this.persona() );
  return comment.vote.persona;
};


Persona.prototype.get_comment_text = function( allow_abuser ){
  var comment = this.get_comment( allow_abuser );
  return comment ? comment.get_text() : "";
};


Persona.prototype.find_applicable_delegations = function( proposition ){
  var found_delegations = [];
  var delegations = this.delegations;
  var vote;
  var agent;
  Ephemeral.each( delegations, function( delegation ){
    if( Delegation.valid( delegation )
    && delegation.is_active()
    && delegation.includes_proposition( proposition )
    ){
      agent = Persona.valid( delegation.agent );
      if( !agent )return;
      // If vote triggers a delegation loop, inactivate the delegation
      if( agent.delegates_to( delegation.persona, delegation.tags ) ){
        trace( "Delegation loop detected, inactivate: " + delegation 
          + ", proposition: " + proposition );
        debugger;
        delegation.inactive( true );
        return;
      }
      vote = agent.get_non_neutral_vote_on( proposition );
      if( !vote )return;
      found_delegations.push( delegation );
    }
  });
  return found_delegations;
};


Persona.prototype.track_vote = function( vote ){
// Called by Vote constructor
  De&&mand( vote.persona === this );
  var votes = this.votes();
  De&&mand( votes.indexOf( vote ) === -1 );
  votes.push( vote );
  this.votes( votes );
  this._votes_indexed_by_proposition[ vote.proposition.key ] = vote;
  return this;
};


Persona.prototype.untrack_vote = function( vote ){
  var votes = this.votes();
  var idx = votes.indexOf( vote );
  De&&mand( idx !== -1 );
  votes.splice( idx, 1 );
  De&&mand( votes.indexOf( vote ) ===  -1 );
  this.votes( votes );
  this._votes_indexed_by_proposition[ vote.proposition.key ] = _;
  return this;
};


Persona.prototype.add_member = function( member ){
  if( !Persona.valid( member ) )return this;
  var members = this.members();
  De&&mand( members.indexOf( member ) === -1 );
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
  if( !Membership.valid( membership ) )return this;
  var memberships = this.memberships();
  De&&mand( memberships.indexOf( membership ) === -1 );
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
  De&&mand( typeof idx !== "undefined" );
  // ToDo: quid of compaction?
  memberships[ idx ] = _;
  membership.insert_index = _;
  // memberships.splice( idx, 1 );
  // Not cloned, not needed
  this.memberships( memberships );
  return this;
};


Persona.prototype.measure_name = function(){ return this.key; };
Persona.prototype._measure_name_is_alpha = true;


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

  if( !Persona.valid( options.persona ) )return null;
  assert( options.id_str );

  this.persona     = options.persona;
  this.label       = options.id_str;
  this.text        = options.text || "?";
  this.user        = options.user; // id_str of the user
  this.screen_name = options.screen_name || "?"; // What comes after @
  this.name        = options.name || this.screen_name;
  this.vote        = plasma( options.vote ); // When associated to a vote
  this.topic       = plasma( options.topic || (options.vote && options.vote.proposition ) );
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
  
  assert( options.label );
  if( !options.label )return null;
  if( options.persona && !Persona.valid( options.persona ) )return null;

  this.label = options.label;
  this.name  = namize( this.label );

  var topic = this.register( this.name );
  if( !topic )return null;
  var plasma = this.plasma( topic );
  
  this.source       = plasma( options.source );
  this.votes        = plasma( options.votes );
  this.votes_log    = plasma( options.votes_log );
  this.propositions = plasma( options.propositions );
  this.tags         = plasma( options.tags );
  this.delegations  = plasma( options.delegations );
  this.persona      = plasma( options.persona );
  this.comment      = plasma( options.comment );
  this.comments     = plasma( options.comments );
  this.result       = options.result
    || ( this.is_create() && Result.inject({ proposition: this } ) );

  // ToDo: implement .update()?
  if( this.is_update() )return topic.update( this );

  if( !options.votes_log   ){ this.votes_log(   [] ); }
  if( !options.votes       ){ this.votes(       [] ); }
  if( !options.delegations ){ this.delegations( [] ); }
  if( !options.comments    ){ this.comments(    [] ); }
  
  this.count_indirections = 0;
  this.count_recent       = 0;

  //De&&mand( this.delegations()  );
  
  // Let's tag the propositions
  if( options.propositions ){
    Ephemeral.each( options.propositions, function( proposition ){
      proposition.add_tag( topic );
    });
  }else{
    topic.propositions( [] );
  }
  
  // Let the tags know that a new proposition uses them
  if( options.tags ){
    Ephemeral.each( options.tags, function( tag ){
      if( !tag.propositions ){
        trace( "Missing .propositions for tag " + tag, value( tag, true ) );
      }
      De&&mand( tag.propositions && typeof tag.propositions === "function" );
      tag.add_proposition( topic );
      // Create an "agree" vote on the tag on behalf of the proposition creator
      if( options.persona ){
        Vote.inject({
          persona: options.persona,
          proposition: tag,
          orientation: Vote.agree
        });
      }
    });
  }else{
    topic.tags( [] );
  }
  
  // Create an initial "agree" vote by whoever created the topic
  if( options.persona ){
    Vote.inject({
      persona: options.persona,
      proposition: this,
      orientation: Vote.agree
    });
  }
  
}

// Random array of tags involved in indirect votes
Topic.recent = [];

Topic.find = function( key ){
  var namized_key = namize( key ); 
  var entity = Topic.basic_find( namized_key );
  if( entity ){
    entity.check_identity();
  }
  return entity;
};


Topic.prototype.update = function( other ){
  // ToDo: handle .tags and .propositions changes
  this.persona(  other.persona  );
  this.source(   other.source   );
  this.comments( other.comments );
  if( other.result ){ this.result = other.result }
  if( other.delegations ){ this.update_delegations( other.delegations ); }
  return this;
};


Topic.prototype.valid = function(){
  if( this.expired() )return null;
  if( !this.check()  )return null;
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


Topic.prototype.is_tag = function(){
  return !this.is_proposition();
};


Topic.prototype.get_persona = function(){
  return this.is_proposition()
  ? null
  : Persona.find( "@" + this.label.substring( 1 ) );
};


Topic.prototype.is_persona = function(){
  return !!this.get_persona();
};


Topic.prototype.track_vote = function( vote ){
// Called when a vote is created
// ToDo: clean up at expiration
  if( !vote )debugger;
  if( !vote.proposition )debugger;
  var votes = this.votes();
  if( votes.indexOf( vote ) !== -1 )return this;
  // Note: no clone for the array, not needed
  votes.push( vote );
  this.votes( votes );
  return this;
};


Topic.prototype.check = function( dont_delay ){
  
  //if( this.id !== "graverechauffementclimatique" )return true;
  var that = this;
  var votes = this.votes();
  
  // Don't check if unstable state due to pending water propagations
  if( !dont_delay && !water.Machine.current.ready() ){
    if( false ){
      trace( "Cannot check " + this + ", water busy, postpone" );
      trace(
        "State",
        "agree",    that.result.agree(),
        "disagree", that.result.disagree(),
        "blank",    that.result.blank(),
        "protest",  that.result.protest(),
        "votes",    that.result.total(),
        "direct",   that.result.direct(),
        "indirect", that.result.indirect()
      );
    }
    water.effect( function(){ that.check( true ); } );
    return true;
  }
  
  false && de&&bug( "" + ( dont_delay ? "Postponed " : "" ) + "Check of " + that );
  
  try{
  
  var count_agree    = 0;
  var count_disagree = 0;
  var count_blank    = 0;
  var count_protest  = 0;
  var count_votes    = 0;
  var count_direct   = 0;
  var count_indirect = 0;
  
  function dump(){
    trace(
      "Local",
      "agree",    count_agree,
      "disagree", count_disagree,
      "blank",    count_blank,
      "protest",  count_protest,
      "votes",    count_votes,
      "direct",   count_direct,
      "indirect", count_indirect
    );
    trace(
      "State",
      "agree",    that.result.agree(),
      "disagree", that.result.disagree(),
      "blank",    that.result.blank(),
      "protest",  that.result.protest(),
      "votes",    that.result.total(),
      "direct",   that.result.direct(),
      "indirect", that.result.indirect()
    );
    // Look for missing or excessive vote
    var result = that.result;
    votes.forEach( function( vote ){
      if( !vote ){
        trace( "BUG? null vote, proposition: " + that );
        debugger;
        return;
      }
      if( vote.buried ){
        trace( "BUG? buried vote, proposition: " + that );
        debugger;
        return;
      }
      if( !vote.persona ){
        trace( "BUG? vote without a persona, proposition: " + that );
        debugger;
        return;
      }
      if( !result._added_votes[ vote.persona.id ] ){
        if( vote.orientation() === Vote.neutral )return;
        trace(
          "Result does not know about " + vote, ", proposition: " + that
        );
        if( !vote.valid() ){
          trace( "Invalid vote in result, " + vote );
          debugger;
        }
      }
    });
    var result_votes = result._added_votes;
    var result_votes_keys = Object.keys( result_votes );
    result_votes_keys.forEach( function( persona_id ){
      var persona = Persona.find( persona_id );
      if( !persona ){
        trace(
          "Result includes vote from invalid persona", persona_id,
          ", proposition: " + that
        );
        return;
      }
      var vote = persona.get_vote_on( that );
      if( vote ){
        trace(
          "Proposition " + that,
          "Vote " + vote,
          "orientation: " + vote.orientation(),
          "delegation: "  + vote.delegation()
        );
      }else{
        trace(
          "Result includes invalid vote from persona " + persona,
          ", proposition: " + that
        );
        var found = false;
        votes.forEach( function( vote ){
          if( vote.persona === persona ){
            trace( "Problematic vote: " + vote, ", proposition: " + that );
            found = vote;
          }
        });
        if( !found ){
          trace(
            "Problematic vote from " + persona, "not found in votes..." );
        }else{
          if( !found.valid() ){
            trace( "Problematic vote was found: " + found );
            if( found.expired() ){
              // trace( "Problematic vote is expired" );
              return;
            }else{
              trace( "Problematic vote was found: " + found );
            }
          }else{
            trace( "Problematic vote is valid: " + found );
          }
          if( found.buried ){
            trace( "Problematic vote was buried" );
          }
        }
        debugger;
      }
    });
  }
  
  function check( v1, v2 ){
    if( v1 === v2 )return true;
    trace( "!!! Failed .check() on " + that );
    dump();
    debugger;
    return false;
  }
  
  votes.forEach( function( vote ){
    
    if( !vote || vote.buried )return;
    
    var orientation = vote.orientation();
    if( orientation === Vote.neutral )return;
    
    if( vote.expired() ){
      trace( "Votes includes a non buried expired vote: " + vote );
    }
    
    var valid = true;
    
    if( orientation === Vote.agree ){
      count_agree++;
    }else if( orientation === Vote.disagree ){
      count_disagree++;
    }else if( orientation === Vote.blank ){
      count_blank++;
    }else if( orientation === Vote.protest ){
      count_protest++;
    }else{
      trace( "BUG? unknown orientation", orientation, " for vote " + vote );
      if( vote.constructor.basic_find( vote.id ) !== vote ){
        trace( "Vote is not the proper typed entity" );
      }
      if( Ephemeral.get_all_entities()[ vote.id ] !== vote ){
        trace( "Vote is not the proper global entity" );
      }
      valid = false;
      debugger;
    }
    if( valid ){
      count_votes++;
      if( vote.delegation() === Vote.direct ){
        count_direct++;
      }else{
        count_indirect++;
      }
    }

  });
  
  var ok = true
  && check( count_agree,    this.result.agree()    )
  && check( count_disagree, this.result.disagree() )
  && check( count_blank,    this.result.blank()    )
  && check( count_protest,  this.result.protest()  )
  && check( count_votes,    this.result.total()    )
  && check( count_direct,   this.result.direct()   )
  && check( count_indirect, this.result.indirect() );
  
  if( false && de && ok ){
    trace( "Check OK " + this );
    dump();
  }
  
  return ok;
  
  }catch( err ){
    trace( "ERROR during topic.check()", err, err.stack );
    debugger;
    return false;
  }
};


Topic.prototype.is_abuse = function(){
  return this.result.is_abuse();
};


Topic.prototype.orientation = function(){
  return this.result.orientation();
};


Topic.prototype.get_vote_of = function( persona ){
  if( !Persona.valid( persona ) )return null;
  var vote = Vote.find( persona.id + "." + this.id );
  if( vote && !vote.proposition ){
    trace( "BUG? vote without a proposition: " + vote );
    return null;
  }
  return vote;
};


Topic.prototype.get_non_neutral_vote_of = function( persona ){
  var vote = this.get_vote_of( persona );
  if( !vote )return vote;
  return !vote.is_neutral() ? vote : null;
};


Topic.prototype.agent_vote_sample = function( agents_avoid_map ){
// Pick a random agent vote among the valid votes on the topic.
// Note: the probability to pick an agent is proportional to the her presence
// inside the log.
// Avoid previous agents if specified by the optional map.
  var log = this.votes_log();
  var len = log.length;
  if( !len )return null;
  var random_index =  Math.floor( Math.random() * len );
  var ii;
  var vote_value;
  var vote;
  var agent_name;
  var agent;
  var agent_vote;
  for( ii = random_index ; ii < len ; ii++ ){
    vote_value = log[ ii ];
    if( vote_value.delegation === Vote.direct )continue;
    vote = Vote.valid( vote_value.entity );
    if( !vote )continue;
    agent_name = vote_value.agent_label;
    if( agents_avoid_map && agents_avoid_map[ agent_name ] )continue;
    agent = Persona.find( agent_name );
    if( !agent )continue;
    agent_vote = Vote.find( agent_name + "." + this.id );
    if( !agent_vote )continue;
    if( agent_vote.orientation() === Vote.neutral )continue;
    return agent_vote;
  }
  return null;
};


Topic.prototype.agent_vote_samples = function( n, agents_avoid_map ){
// Collect random agent votes from at most n distinct agents
  var many = n || 5;
  var ii;
  var list = [];
  var avoid_map  = agents_avoid_map || {};
  var agent_vote;
  for( ii = 0 ; ii < many ; ii++ ){
    agent_vote = this.agent_vote_sample( avoid_map );
    if( !agent_vote )continue;
    list.push( agent_vote );
    agents_avoid_map[ agent_vote.persona.label ] = true;
  }
  return list;
};


Topic.prototype.add_recent = function(){
  var random_index = Math.floor( Math.random() * 100 );
  var old_one = Topic.recent[ random_index ];
  if( old_one ){
    old_one.count_recent--;
  }
  Topic.recent[ random_index ] = this;
  this.count_recent++;
};


Topic.prototype.is_recent = function(){
  return !!this.count_recent;
};


Topic.prototype.heat = function( persona ){
// Compute the "heat" of a topic. "Hot topics" should come first.
// If persona is specified and never voted the topic, it doubles the heat
  var touched = this.count_recent;
  // Less recently touched topics are hot depending on number of direct votes
  // Less recently touched tags are hot depending on number of propositions
  if( !touched ){
    touched = this.is_tag() ? this.propositions().length : this.result.direct();
    // Very small, much smaller than any tag recently involved in an indirect vote
    touched = touched / 1000000000;
  }
  // Double the heat if not voted by persona (and not too old however)
  if( persona && !Vote.find( "" + persona.name + "." + this.name ) ){
    touched = touched * 2;
  }
  return touched;
};


Topic.prototype.measure_age_modified = function( persona ){
  if( persona ){
    var vote = Vote.find( persona.key + "." + this.key );
    if( vote )return vote.measure_age_modified();
  }
  return Ephemeral.prototype.measure_age_modified.call( this );
};


Topic.prototype.measure_heat = function( persona ){
  return this.heat( persona );
};


Topic.prototype.measure_trust = function( persona ){
  if( !persona )return this.measure_direct_votes();
  return persona.trust_level_on( this );
};


Topic.prototype.measure_activity = function(){
  return this.votes_log().length;
};


Topic.prototype.measure_comments = function(){
  return this.comments().length;
};


Topic.prototype.measure_author = function(){
  var author = this.get_comment_author();
  return author ? author.name : "~"; // ~ is greater than z
};
Topic.prototype._measure_author_is_alpha = true;


Topic.prototype.measure_total_votes = function(){
  return this.result.total();
};


Topic.prototype.measure_changes = function(){
  return this.result.count();
};


Topic.prototype.measure_direct_votes = function(){
  return this.result.direct();
};


Topic.prototype.measure_indirect_votes = function(){
  return this.result.total() - this.result.direct();
};


Topic.prototype.measure_propositions = function(){
// High for tags with lots of propositions tagged with them
  return this.propositions().length;
};


Topic.prototype.measure_delegations = function(){
  return this.delegations().length;
};


Topic.prototype.measure_participation = function(){
// Participation is % of direct vote. ie more indirect votes signal low
// participation
  var total  = this.result.total();
  var direct = this.result.direct();
  if( direct === total )return total;
  return this.result.direct() / this.result.total();
};


Topic.prototype.measure_protestation = function(){
// Protestation is % of protest + blank votes.
// ToDo: increase weight of prostest votes?
  return ( this.result.blank() + this.result.protest() ) / this.result.total();
};


Topic.prototype.measure_success = function(){
// Success is proportion of winning vote, whatever the for/against result
  var total = this.result.total();
  var agree = this.result.agree();
  var against = this.result.against();
  if( agree > against ){
    return agree / total;
  }else{
    return against / total;
  }
};


Topic.prototype.measure_orientation = function(){
  var orientation = this.result.orientation();
  if( orientation === Vote.neutral  )return 1;
  if( orientation === Vote.blank    )return 2;
  if( orientation === Vote.protest  )return 3;
  if( orientation === Vote.disagree )return 4;
  if( orientation === Vote.agree    )return 5;
  return 6;
};


Topic.prototype.filter_string = function( persona, only_delegateable ){
  var tags = this.tags() || [];
  var sorted_tags = tags.sort( function( a, b ){
    // Most agreed first
    var a_rank = a.result.orientation() + a.result.direct();
    var b_rank = a.result.orientation() + a.result.direct();
    if( a_rank < b_rank )return -1;
    if( a_rank > b_rank )return  1;
    return 0;
  });
  var buf = [];
  Ephemeral.each( sorted_tags, function( tag ){
    buf.push( tag.label );
  });
  if( only_delegateable )return buf.join( " " );
  return ( buf.join( " " ) + this.computed_tags( persona ) ).trim();
};


Topic.reserved_tags = {
  all:        true,
  but:        true,
  and:        true,
  or:         true,
  not:        true,
  vote:       true,
  trust:      true,
  tag:        true,
  new:        true,
  hot:        true,
  spam:       true,
  nsfw:       true,
  recent:     true,
  draft:      true,
  old:        true,
  today:      true,
  yesterday:  true,
  fade:       true,
  protest:    true,
  orphan:     true,
  referendum: true,
  persona:    true,
  impersonal: true,
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
  search:     true,
  propose:    true,
  delegate:   true,
  jhr:        true  // End Of List
};

Topic.reserved_tags_comments = {
  all:        "Filter tag for tag inclusion detection, opposite to #but",
  but:        "Filter tag for tag exclusion detection, opposite to #all",
  and:        "Filter tag, not implemented yet, default logic is 'and' already",
  or:         "Filter tag, not implemented yet, future 'or' logic operator",
  not:        "Filter tag, not implemented yet, future 'not' logic operator",
  vote:       "with a vote from you",
  trust:      "with a vote by at least one agent",
  tag:        "about tags themselves",
  new:        "without a vote from you",
  hot:        "supposedly worth considering",
  spam:       "spam, not implemented yet",
  nsfw:       "nsfw, not implemented yet",
  recent:     "with recent activity, opposite to #old",
  draft:      "without tags yet",
  old:        "without recent activity, opposite to #recent",
  today:      "updated during the last 24 hours",
  yesterday:  "updated during the last 48 hours but not today",
  fade:       "that are fading away",
  protest:    "with more than 1% of protest votes",
  orphan:     "tags with a single proposition",
  referendum: "new propositions with votes from 1% of visitors",
  persona:    "about a persona",
  impersonal: "not about a persona",
  topic:      "about a topic, not implemented yet",
  result:     "about some other results",
  group:      "about a group persona",
  membership: "about a group membership",
  tagging:    "about a tagging action",
  delegation: "about a delegation setup",
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
  you:        "about you, not implemented yet",
  them:       "not about you, not implemented yet",
  abuse:      "with a majority of 'protest' votes",
  win:        "with a majority of 'agree' votes",
  blank:      "with a majority of 'blank' votes",
  tie:        "with a for/against votes equality",
  jhr:        "not implemeted yet, virteal!"  // End Of List
};

// ToDo: manage incompatible tags
// This is to avoid abusive tagging where incompatible tags are proposed by
// trolls.
// That list should be managed democratically...
Topic.incompatible_tag_combinations = [
  "fun politique"
];

// Key is alphabetically smaller tag
Topic.incompatible_tags = {
  "fun": "politique"
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
  var first_char = tag[0];
  if( first_char === "@" ){
    var persona = Persona.find( tag );
    return persona ? persona.label : "";
  } else if( first_char === "#" ){
    tag = tag.substring( 1 );
  }
  // One letter tags are all reserved for future use
  if( tag.length < 2 )return "reserved short tag";
  return Topic.reserved_tags_comments[ tag ];
};


Topic.prototype.computed_tags = function( persona ){
  var buf = [];
  var voted = false;
  var vote;
  if( persona ){
    vote = Vote.find( persona.name + "." + this.name );
    if( vote ){
      voted = true;
      if( !vote.orientation ){
        trace( "BUG? missing vote orientation, vote: " + vote );
        debugger;
      }else{
        if( vote.orientation() !== Vote.neutral ){
          buf.push( "#vote" );
        }
      }
    }else{
      buf.push( "#new" );
    }
    if( persona.trust_on( this ) ){
      buf.push( "#trust" );
    }
  }
  if( this.is_tag() ){
    buf.push( '#tag' );
    if( Persona.find( "@" + this.label.substring( 1 ) ) ){
      buf.push( "#persona" );
    }else if( this.is_tag() ){
      buf.push( "#impersonal" );
    }
  }else{
    var all_tags = this.tags();
    if( !all_tags.length ){
      buf.push( "#draft" );
    }else if( all_tags.length === 1 ){
      var first_tag = this.tags()[0];
      if( Persona.find( "@" + first_tag.key.substring( 1 ) ) ){
        buf.push( "#draft" );
      }
    }
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
  }else{
    if( this.is_recent() ){
      buf.push( "#hot" );
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
  if( v.orientation() !== Vote.neutral
  &&  v.delegation()  === Vote.direct
  ){
    this.touch();
  }
  var added_vote_value = this.log_vote( v );
  this.result.add_vote( v );
  return added_vote_value;
};


Topic.prototype.remove_vote = function( was ){
// Called by vote.remove()
  //this.log_anti_vote( was );
  this.result.remove_vote( was );
};


Topic.prototype.log_vote = function( v ){
// Called by .add_vote()
// There is a log of all votes. It is a snapshot copy of the vote value that is
// kept because a persona's vote can change over time and both persona and
// vote can expire.
  de&&bug( "Log vote " + v );
  var val = v.snap_value();
  var votes_log = this.votes_log();
  votes_log.push( val );
  this.votes_log( votes_log );
  // Also in global list of all vote values
  Vote.log.push( val );
  return val;
};


Topic.prototype.log_anti_vote = function( was ){
// ToDo: this is not called anymore, remove?
// Called by remove_vote()
// When a vote is removed (erased), it is removed from the log of all the votes
// on the proposition.
  var votes_log = this.votes_log();
  // Look for the logged vote
  var found_idx;
  var ii = votes_log.length;
  var vote;
  while( ii-- ){
    vote = votes_log[ ii ];
    if( !vote )continue;
    if( vote.entity.id === was.id ){
      found_idx = ii;
      break;
    }
  }
  // The vote must be there, ie log_vote() was called before
  De&&mand( typeof found_idx !== "undefined" );
  // No clone, votes contains the valid votes, ie not the removed ones
  // ToDo: this is rather slow, maybe nullification would be better, with
  // some eventual compaction
  votes_log.splice( found_idx, 1 );
  this.votes_log( votes_log );
  return this;
};


Topic.prototype.clear_votes_log = function( vote ){
// This is called when a vote expires and is buried. All traces are removed.
  // ToDo: remove or not removed
  //return this;
  var votes_log = this.votes_log();
  var new_log  = [];
  var len = votes_log.length;
  var vote_value;
  for( var ii = 0 ; ii < len ; ii++ ){
    vote_value = votes_log[ ii ];
    if( !vote_value )continue;
    if( vote_value.entity !== vote ){
      new_log.push( vote_value );
    }
  }
  this.votes_log( new_log );
  Vote.some_expired_votes = true;
  return this;
};


Topic.prototype.add_tag = function( tag, loop ){
  if( !Topic.valid( tag ) )return this;
  var list = this.tags() || [];
  // Cannot tag itself
  if( tag === this )return this;
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
  De&&mand( idx !== - 1 );
  new_list.splice( idx, 1 );
  this.tags( new_list );
  if( !loop ){
    tag.remove_proposition( this, true );
    tag.update_votes();
  }
  return this;
};


Topic.prototype.add_comment = function( comment ){
  
  if( !Comment.valid( comment              ) )return this;
  if( !Vote.valid(   comment.vote          ) )return this;
  if( !Persona.valid( comment.vote.persona ) )return this;
  
  // Ignore comments from abusers
  if( comment.vote.persona.is_abuse() )return this;
  
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
  var main_comment = this.comment;
  if( !main_comment // no comment yet
  ||  !Vote.valid( main_comment.vote ) // obsolete comment
  ||  !Persona.valid( main_comment.vote.persona ) // obsolete persona
  ||  main_comment.vote.persona.is_abuse() // Abuser
  ||  comment.vote.persona === main_comment.vote.persona // same persona
  ||  comment.vote.persona.id.replace( "@", "#" ) === this.id // on herself
  ){
    
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


Topic.prototype.get_comment = function( allow_abuser ){
  var comment = this.comment();
  if( !comment )return null;
  if( !comment.valid() )return null;
  if( !Vote.valid( comment.vote ) )return null;
  if( !Persona.valid( comment.vote.persona ) )return null;
  if( !allow_abuser && comment.vote.persona.is_abuse() )return null;
  return comment;
};


Topic.prototype.get_comment_author = function( allow_abuser ){
  var comment = this.get_comment( allow_abuser );
  if( !comment )return null;
  return comment.vote.persona;
};


Topic.prototype.author_is = function( persona ){
  if( !persona )return true;
  var author = this.get_comment_author();
  if( !author )return true;
  return author === persona;
};


Topic.prototype.get_comment_text = function( allow_abuser ){
  var comment = this.get_comment( allow_abuser );
  return comment ? comment.get_text() : "";
};


Topic.prototype.remove_comment = function( comment ){
  var list = this.tags() || [];
  var idx = list.indexOf( comment );
  // Done if already not there
  if( idx === -1 )return this;
  // ToDo: avoid clone?
  var new_list = list;
  De&&mand( idx !== - 1 );
  new_list.splice( idx, 1 );
  this.comments( new_list );
  return this;
};


Topic.prototype.add_proposition = function( proposition, loop ){
// Each tag has a list of all the propositions that are tagged with it
  if( !Topic.valid( proposition ) )return this;
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
  De&&mand( idx !== - 1 );
  new_list.splice( idx, 1 );
  this.propositions( new_list );
  if( !loop ){
    proposition.remove_tag( this, true );
    this.update_votes();
  }
  return this;
};


Topic.prototype.has_tag = function( tag_name, persona ){
  var tag_entity = Topic.find( tag_name );
  if( tag_entity )return this.tags().indexOf( tag_entity ) !== -1;
  var computed_tags = this.computed_tags( persona );
  return computed_tags.indexOf( " " + tag_name + " " ) !== -1;
};


Topic.prototype.filtered = function( filter, query, persona ){
// True if proposition pass thru the filter, ie proposition not filtered out

  if( this.expired() )return false;

  // If no filter, all pass, but abuses
  if( !filter && !query ){
    return !this.is_abuse();
  }
  
  // Abuses don't pass, unless filter explicitly accept them
  if( this.is_abuse() ){
    if( filter.indexOf( " #abuse " ) === -1 )return false;
  }

  // OK, let's check the tags
  var ok = this.is_tagged( filter, persona );
  if( !ok )return false;
  
  if( !query )return true;
  var full_text = this.full_text();
  query.split( " " ).every( function( keyword ){
    if( full_text.indexOf( keyword ) === -1 ){
      ok = false;
      return false;
    }
    return true;
  });
  return ok;
};


Topic.prototype.is_tagged = function( tags, persona ){
// Returns true if a topic includes all the specified tags
// Note: #something always includes itself, ie proposition xxx is #xxx tagged
  if( typeof tags === "string" ){
    return string_tags_includes(
      this.tags_string( persona, tags.indexOf( " #abuse " ) !== -1 ),
      tags
    );
  }
  return tags_includes( this.tags() || [], tags, this.label );
};


Topic.prototype.tags_string = function( persona, with_abuses, not_computed ){
  var topic_tags_str = this.is_tag() ? [ this.label ] : [ "#" + this.label ];
  var sorted_tags = this.tags().sort( function( a, b ){
    return a.heat() - b.heat();
  });
  Ephemeral.each( sorted_tags, function( tag ){
    if( with_abuses || !tag.is_abuse() ){
      topic_tags_str.push( tag.label );
    }
  });
  if( not_computed ){
    return topic_tags_str.join( " " );
  }
  return topic_tags_str.join( " " ) + this.computed_tags( persona );
};


Topic.prototype.full_text = function(){
  var text = this.id + " " + this.tags_string();
  Ephemeral.each( this.comments, function( comment ){
    text += " " + comment.text.toLowerCase();
  });
  return text;
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
    var tag_is_there = tags.indexOf( tag + " "  ) !== -1;
    if( !tag_is_there && tag === "#and" )return true;
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
  var other_len =  other_tags.length;
  if( tags.length < other_tags.length )return false;
  var tag;
  for( var ii = 0 ; ii < other_len ; ii++ ){
    tag = other_tags[ ii ];
    if( tags.indexOf( tag ) === -1 ){
      // When an other tag is not found, enable the proposition to tag itself
      if( !misc
      || ( tag.name !== misc
        && tag.name !== '#' + misc )
      )return false;
    }
  }
  return true;
}

Topic.prototype.add_delegation = function( delegation, loop ){
// Each tag has a list of all the delegations that involve it
  if( !Delegation.valid( delegation ) )return this;
  var delegations = this.delegations() || [];
  if( delegations.indexOf( delegation ) === -1 ){
    delegations.push( delegation );
    this.delegations( delegations );
  }
  if( !loop ){
    // ToDo: remove this. delegation.add_tag( this, true );
  }
  return this;
};


Topic.prototype.update_votes = function(){
// Update delegated votes, calls .update_votes() for each delegation
  Ephemeral.each( this.delegations, function( delegation ){
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
  if( !Topic.valid( options.proposition ) )return null;
  this.proposition = options.proposition;
  // Tags/Detags are either #str or Tag entities, this gets normalized
  this.tags        = options.tags   || [];
  this.detags      = options.detags || [];
  this.persona     = options.persona;
  var that = this;
  // Remove tags first, this will restrict the delegations that apply
  var detag_entities = [];
  this.detags.forEach( function( tag ){
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
    if( !tag )return;
    var tag_entity = ( tag.is_entity && tag ) || Topic.find( tag );
    if( !tag_entity ){
      trace( "On the fly creation of first seen tag " + tag );
      De&&mand( tag[0] === "#" );
      tag_entity = Topic.inject( {
        label: tag,
        persona: that.persona
      } );
    }
    // Cannot tag itself
    if( tag_entity === that.proposition )return;
    // Add tag, unless duplicate
    if( tag_entities.indexOf( tag_entity ) === -1 ){
      tag_entities.push( tag_entity );
      that.proposition.add_tag( tag_entity );
    }
    // Inject an "agree" vote on the tag by the persona who is tagging
    if( that.persona ){
      Vote.inject({
        persona: that.persona,
        proposition: tag_entity,
        orientation: Vote.agree
      });
    }
  });
  // Normalizes, keep entities only, no strings, no duplicates
  this.detags = tag_entities;
  this.tags   = tag_entities;
}


Tagging.prototype.valid = function(){
  return ( !this.expired() && this.proposition.valid() ) ? this : null;
};


/*
 *   Comment entity
 *
 *   Personas can leave comments to explain things about their vote.
 */

Event.type( Comment );
function Comment( options ){

  if( !Vote.valid( options.vote ) )return null;
  assert( options.text );

  // ToDo: fix this, should be the true object
  if( options.vote !== Vote.find( options.vote.key ) ){
    trace( "BUG! invalid options.vote in new Comment" );
    trace( "options.vote: " + options.vote );
    trace( "typeof options.vote: " + typeof options.vote );
    trace( "options.vote.type: " + options.vote.type );
    trace( "options.vote.key: " + options.vote );
    options.vote = Vote.find( options.vote.key );
    trace( "options.vote: " + options.vote );
    debugger;
  }
  this.vote = options.vote;
  this.text = options.text;
  this.vote.set_comment( this );
  this.vote.proposition.add_comment( this );

}


Comment.prototype.valid = function(){
  return ( !this.expired() && Vote.valid( this.vote ) ) ? this : null;
};


Comment.prototype.get_text = function(){
  return this.valid() ? this.text : "";
};


Comment.prototype.expiration = function(){
  if( this.vote.comment() === this ){
    this.vote.comment( null );
  }
  this.topic.remove_comment( this );
};


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
  
  if( options.debug ){
    Kudo.debug_mode( de = true );
    debugger;
  }
  
  // If create, check that both persona & proposition are valid
  // ToDo: warning?
  if( !options.id_key ){
    if( !Persona.valid( options.persona )     )return null;
    if( !Topic.valid(   options.proposition ) )return null;
    
  // If update, check that entity (still) exists
  }else{
    if( !Vote.find( options.id_key ) ){
      trace( "Attempt to update a non existing vote, key: " + options.id_key );
      return null;
    }
  }
  
  // Decide: is it a new entity or an update? key is @persona_id.proposition_id
  var key = options.id_key
  || ( "" + options.persona.id + "." + options.proposition.id );
  
  var vote = this.register( key );
  if( !vote )return null;

  var persona      = Persona.valid( options.persona || vote.persona );
  var proposition  = Topic.valid( options.proposition || vote.proposition );
  
  if( proposition && proposition.id === "xdebat_f2_melencho" ){
    debugger;
  }
  
  if( !proposition ){
    trace( "BUG? create/update a vote without a proposition, key: " + key );
    debugger;
    return null;
  }
  
  // Ignore action if proposition or persona are expired
  if( !persona || !proposition )return null;
  
  var orientation  = options.orientation;

  this.persona     = persona;
  this.persona.touch();
  this.label       = options.label || (persona.label + "/" + orientation );
  this.proposition = proposition;
  this.proposition.touch();
  this._agent_vote = null;

  if( this.is_update() ){
    !vote.buried && vote.update( this, options );
    return vote;
  }
  
  if( typeof orientation === "undefined" ){
    trace(
      "BUG? create a vote without an orientation, assume 'neutral'",
      "key: " + key
    );
    // debugger;
    orientation = Vote.neutral;
  }
  
  this.analyst     = plasma( options.analyst );
  this.source      = plasma( options.source );
  this.comment     = plasma( options.comment );
  
  this.delegation  = plasma( options.delegation || Vote.direct  );
  
  if( de && options.delegation ){
    var delegation = options.delegation;
    assert( Delegation.valid( delegation ) );
    var agent = Persona.valid( delegation.agent );
    assert( agent );
    var represented_persona = Persona.valid( delegation.persona );
    assert( represented_persona );
    assert( represented_persona === persona );
    var agent_vote = agent.get_vote_on( proposition );
    assert( agent_vote );
  }
  
  this.snapshot = null; // See Topic.log_vote() & Topic.set_comment()
  this.previous_orientation  = plasma( options.previous_orientation  || Vote.neutral );
  this.orientation = plasma();
  // Nota: water, not plasma, I don't care about multiple changes
  var w = water( _, error_traced( update ), [ 
    this.delegation,
    this.orientation
  ] );
  w.vote = this;
  w.added_vote_value = _;
  this.persona.track_vote( this );
  this.proposition.track_vote( this );
  this.orientation( orientation );
  return vote;
  
  // Trigger on orientation or delegation change
  // But only on "final" changes, this is water, not plasma.
  // When such event happens, a new vote value is added to the proposition
  // after the previous add (if any) was removed.
  function update(){
    var vote_water = water.current;
    var vote = vote_water.vote;
    if( vote.proposition.id === "xdebat_f2_melencho" )debugger;
    if( vote.expired() )return;
    try{
      
      var was_vote = vote_water.added_vote_value;
      var was_orientation = was_vote && was_vote.orientation;
      var was_delegation  = was_vote && was_vote.delegation;
      
      var orientation = vote.orientation();
      var delegation  = vote.delegation();
      
      var orientation_changed = typeof was_orientation === "undefined"
      || orientation != was_orientation;
      
      var delegation_changed = typeof was_delegation === "undefined"
      || delegation !== was_delegation;
      
      if( !orientation_changed
      &&  !delegation_changed
      ){
        de&&bug( "Update with no change for " + vote );
        // Something else changed, or vote is simply "touched"
        var time_delta = vote.time_touched - was_vote.time_touched;
        // In such a case, the event is ignored. This is convenient to avoid
        // duplicated votes on the client side when the local vote is duplicated
        // by a change due to the vote on the server side.
        if( time_delta < 10 * 1000 ){
          console.log( "Ignored duplicated update on vote " + vote );
          return;
        }
      }
      
      if( was_vote ){ vote.remove( was_vote ); }
      if( !options.label ){
        vote.label = vote.persona.label + "/" + orientation;
      }
      vote.previous_orientation( was_orientation );
      vote_water.added_vote_value = vote.add();
      
      vote.push();
      
      // Handle delegated votes
      try{
        vote.persona.vote_for_others( vote );
      }catch( err){
        trace( "Could not vote for others" + vote, err, err.stack );
        console.trace( err );
        de&&bugger();
        throw err;
      }
      vote.proposition.check();
    }catch( err ){
      trace( "Could not process update() for vote " + vote, err, err.stack );
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
Vote.direct = null;


Vote.log = [];
Vote.some_expired_votes = false;


Vote.get_log = function(){
  var expired = Vote.some_expired_votes;
  if( !expired.length )return Vote.log;
  var log = Vote.log;
  var len = Vote.log.length;
  var vote;
  for( var ii = 0 ; ii < len ; ii++ ){
    vote = log[ ii ].entity;
    if( vote.valid() )continue;
    log.splice( ii, 1 );
    len--;
    ii--;
  }
  Vote.some_expired_votes = false;
  return log;
};


Vote.find = function( id ){
  var vote = Vote.basic_find( id );
  if( !vote )return vote;
  vote.check_identity();
  // ToDo: some checks
  if( !vote.orientation ){
    trace( "BUG? vote without orientation: " + vote );
    debugger;
    return null;
  }  
  if( typeof vote.orientation() === "undefined" ){
    trace( "BUG? vote with an 'undefined' orientation: " + vote );
    debugger;
    return null;
  }

  return vote;
};


Vote.prototype.valid = function(){
  this.check_identity();
  var found = this;
  if( this.is_update() ){
    trace( "BUG? invalid update instead of entity " + this );
    debugger;
    found = this.effect;
  }
  if( found !== Vote.basic_find( this.id ) ){
    trace( "BUG? this is not the registered entity" );
    debugger;
    return null;
  }
  if( found.expired() )return null;
  if( !found.persona.valid() )return null;
  if( !found.proposition.valid() )return null;
  var delegation = found.delegation();
  if( delegation !== Vote.direct ){
    if( !delegation.valid() )return null;
  }
  if( !found.orientation ){
    trace( "BUG? no orientation for vote " + this );
    debugger;
    return null;
  }
  return found;
};


Vote.prototype.measure_age = function(){
  return this.age();
};


Vote.prototype.measure_orientation = function(){
  var orientation = this.orientation();
  if( orientation === Vote.neutral  )return 1;
  if( orientation === Vote.blank    )return 2;
  if( orientation === Vote.protest  )return 3;
  if( orientation === Vote.disagree )return 4;
  if( orientation === Vote.agree    )return 5;
  return 6;
};


Vote.prototype.measure_topic = function(){
  return this.propostion.measure_name();
};
Vote.prototype._measure_topic_is_alpha = true;

Vote.prototype.measure_voter = function(){ return this.persona.name; };
Vote.prototype._measure_voter_is_alpha = true;

Vote.prototype.measure_total_votes = function(){
  return this.proposition.measure_total();
};


Vote.prototype.touch = function(){
  this.check_identity();
  //this.time_touched = Kudo.now();
  if( this.expired() ){
    trace( "Should not touch expired entity: " + this );
    debugger;
    return;
  }
  if( !this.proposition ){
    trace( "BUG? touching a non expired vote without a proposition: " + this );
    this.check_identity();
    debugger;
    return;
  }
  Vote.super.prototype.touch.call( this );
  if( !this.proposition ){
    debugger;
    return;
  }
  // Proposition & persona must live longer than vote
  this.proposition.outlive( this );
  this.persona.outlive( this );
};


Vote.prototype.is_direct = function(){
  return this.delegation() === Vote.direct;
};


Vote.prototype.is_indirect = function(){
  return this.delegation() !== Vote.direct;
};


Vote.prototype.agent_label = function(){
  var delegation = this.delegation();
  if( delegation === Vote.direct )return null;
  return this.snapshot.agent_label;
}; 


Vote.prototype.agent = function(){
  var delegation = this.delegation();
  if( delegation === Vote.direct )return null;
  if( delegation.expired() ){
    trace( "BUG? expired delegation in vote " + this );
    return null;
  }
  var agent = Persona.valid( delegation.agent );
  if( !agent ){
    trace( "BUG? expired delegation agent for delegation " + delegation
    + " on vote " + this );
    return null;
  }
  if( !Vote.valid( this._agent_vote )
  || this._agent_vote.persona !== agent
  ){
    this._agent_vote = agent.get_non_neutral_vote_on( this.proposition );
  }
  if( !this._agent_vote ){
    trace( "BUG? no valid vote for delegation " + delegation 
    + " via agent " + agent + " on vote " + this );
    return null;
  }
  return this._agent_vote.persona;
};


Vote.prototype.agent_label = function(){
  var agent = this.agent();
  return agent ? agent.label : "";
};

    
Vote.prototype.is_indirect = function(){
  return !this.is_direct();
};


Vote.prototype.filtered = function( filter, query, persona ){
  if( this.expired )return false;
  return this.proposition.filtered( filter, query, persona || this.persona );
};


Vote.prototype.update = function( other, options ){
  if( !this.proposition ){
    trace( "BUG? updating a non expired vote without a proposition:" + this );
    debugger;
    return this;
  }
  // Persona & proposition must live longer than vote
  this.persona.outlive( this );
  this.proposition.outlive( this );
  this.proposition.check(); // true /* don't delay */ );
  this.touch();
  this.set_duration( other.duration    = options.duration    );
  this.analyst(      other.analyst     = options.analyst     );
  this.source(       other.source      = options.source      );
  this.previous_orientation(   other.previous_orientation  = options.previous_orientation  );
  // Don't delegate vote if a direct non neutral vote exists
  if( ( options.delegation && options.delegation !== Vote.direct )
  && this.delegation() === Vote.direct
  && this.orientation() !== Vote.neutral
  ){
    de&&bug( "Not delegated, direct vote rules" );
    debugger;
    return this;
  }
  // If orientation is specified but not delegation, assume direct vote
  var delegation = options.delegation;
  if( typeof options.orientation !== "undefined" ){
    if( typeof options.delegation === "undefined" ){
      delegation = Vote.direct;
    }
  } 
  this.delegation( other.delegation = delegation );
  delegation = this.delegation();
  if( delegation !== Vote.direct ){
    // Delegation must live longer than vote?
    // delegation.outlive( this );
    // No! Delegation may expire before vote
  }
  this.orientation( other.orientation = options.orientation );
  return this;
};


Vote.prototype.expiration = function(){
// At expiration vote becomes direct neutral for a while
  if( this.buried && this.buried !== "pre-expiration" ){
    trace( "BUG? expiration for buried entity" );
    debugger;
    return;
  }
  if( !this.orientation ){
    trace( "BUG? no orientation at expiration " + this );
    this.check_identity();
    debugger;
    return;
  }
  if( this.orientation && !this.is_neutral() ){
    de&&bug( "Pre-expiration for " + this );
    this.resurrect();
    this.renew();
    // Persona and proposition must live longer than vote
    this.persona.outlive( this );
    this.proposition.outlive( this );
    Vote.inject({
      id_key: this.id,
      orientation: Vote.neutral,
      delegation:  Vote.direct
    });
  }else{
    de&&bug( "Expiration for " + this );
    this.proposition.clear_votes_log( this );
    this.persona.untrack_vote( this );
    Vote.some_expired_votes = true;
    Vote.super.prototype.expiration.call( this );
  }
  return this;
};


Vote.prototype.is_neutral = function(){
  return this.orientation() === Vote.neutral;
};


Vote.prototype.filtered = function( filter, query, persona ){
  if( this.expired() )return false;
  if( this.persona.expired() )return false;
  return this.proposition.filtered( filter, query, persona );
};


Vote.prototype.snap_value = function(){
  var val = this.value();
  // Remember last snapshot so that comment change can be propagated to it...
  this.snapshot = val;
  val.snaptime = Kudo.now();
  // Save entity, beware, it may expire
  val.entity = this;
  // Save comment, it can change
  val.comment_text = val.comment && this.comment().text;
  // Save persona's name, persona may expire
  val.persona_label = this.persona.label;
  // Save agent's name, delegation may expire
  if( val.delegation !== Vote.direct ){
    var delegation = Delegation.find( val.delegation );
    if( delegation ){
      val.agent_label = delegation.agent.label;
    // If delegation expired, use it's id to figure out a decent label
    }else{
      // Use id
      delegation = val.delegation;
      if( delegation ){
        var idx = delegation.indexOf( "." );
        val.agent_label = delegation.substring( 0, idx - 1 );
      }
    }
  }
  return val;
};


Vote.prototype.get_old_value = function( when_min, when_max ){
// Return a value for the vote at some point in time

  // No vote if vote was created too late
  if( when_max && this.timestamp > when_max )return null;
  
  // If not too late
  if( !when_max
  || this.time_touched <= when_max
  ){
    // If not too early, ok
    if( !when_min
    || this.time_touched >= when_min )return this.snap_value();
  }
  
  // Look at previous vote
  if( this.snapshot ){
    // Not too late
    if( !when_max || this.snapshot.snaptime <= when_max ){
      // If not too early, ok
      if( !when_min || this.snapshot.snaptime <= when_min
      )return this.snapshot;
    }
  }
  
  // Look at log of votes, backward in time
  var proposition = Topic.valid( this.proposition );
  if( !proposition )return null;
  // ToDo: should look at vote log for said persona only
  var log = proposition.votes_log();
  var len = log.length;
  if( !len )return null;
  var vote_value;
  
  while( len ){
    vote_value = log[ len-- ];
    if( !vote_value )continue;
    if( when_max && vote_value.snaptime > when_max )continue;
    if( when_min && vote_value.snaptime < when_min )break;
    if( vote_value.persona !== this.persona.name )continue;
    return vote_value;
  }
  
  return null;
};


Vote.prototype.add = function(){
  
  var vote = this;
  De&&mand( this.proposition );
  de&&bug( "Add vote " + vote
    + " now " + vote.orientation()
    + " of " + vote.persona
    + " via " + vote.delegation()
    + " for proposition " + vote.proposition
  );
  
  // Make sure that the persona && proposition outlive the vote
  vote.proposition.outlive( vote );
  vote.persona.outlive( vote );
  
  // If delegated, increase agent's count of indirect votes
  var delegation = vote.delegation();
  if( delegation !== Vote.direct ){
    delegation.count_indirections++;
    // Also increase count of involved tags
    Ephemeral.each( delegation.tags, function( tag ){
      tag.count_indirections++;
      tag.add_recent();
    });
    // Update expertize
    var expertize = DelegationExpertize.register( delegation );
    expertize.track_vote( vote );
    // Also make sure that the delegation last for as long as the vote does?
    // delegation.outlive( vote );
    // No! delegation may expire before vote
  }
  
  // Keep persona alive
  if( delegation  === Vote.direct
  &&  vote.orientation() !== Vote.neutral
  ){
    vote.persona.touch();
  }
  var added_vote_value = vote.proposition.add_vote( vote );

  // Direct neutral vote enables delegated votes
  if( this.orientation() === Vote.neutral ){
    if( delegation === Vote.direct ){
      this.vote_via_agent();
    }
  }
  return added_vote_value;
};


Vote.prototype.remove = function( was ){
  //debugger;
  De&&mand( !was.is_entity );
  var vote = this;
  de&&bug( "Remove vote " + this, "was " + was.oriention );
  //de&&bugger();
  vote.proposition.remove_vote( was );
return this;
};


Vote.prototype.vote_via_agent = function( force_neutral ){
// Direct neutral vote triggers delegations. Also happens when a delegation
// expires, its vote need to be reevaluated.
  De&&mand( force_neutral || this.orientation() === Vote.neutral );
  De&&mand( this.delegation()  === Vote.direct  );
  var delegations = this.find_applicable_delegations();
  if( !delegations.length )return this;
  // Sort delegations based on number of filtering tags and age
  if( delegations.length > 1 ){
    delegations = delegations.sort( function( a, b ){
      var count_a = a.tags.length;
      var count_b = b.tags.length;
      if( count_a === count_b ){
        count_a = a.age_touched();
        count_b = a.age_touched();
        return a - b; // young first
      }else{
        return b - a; // more tags first
      }
    });
    // debugger;
  }
  // If multiple delegations apply, select the most recently touched active one
  var tried_delegations = {};
  while( true ){
    var recent_delegation = null;
    delegations.every( function( delegation ){
      if( tried_delegations[ delegation.id ] )return true;
      if( !recent_delegation
      || delegation.age_touched() < recent_delegation.age_touched()
      ){
        recent_delegation = delegation;
        return false;
      }
      return true;
    });
    if( recent_delegation ){
      tried_delegations[ recent_delegation.id ] = true;
      if( this.vote_using_delegation( recent_delegation ) )break;
    }else{
      break;
    }
  }
  return this;
};


Vote.prototype.find_applicable_delegations = function(){
  return this.persona.find_applicable_delegations( this.proposition );
};


Vote.prototype.vote_using_delegation = function( delegation ){
// Try to delegate vote using delegation, return true if done

  if( !Delegation.valid( delegation ) ){
    trace( "BUG? attempt to use an invalid delegation: " + delegation );
    debugger;
    Delegation.valid( delegation );
    return false;
  }
  
  if( !delegation.is_active() )return false;
  
  var persona = Persona.valid( delegation.persona );
  var agent   = Persona.valid( delegation.agent );
  if( !agent || !persona )return false;
  
  var agent_vote
  = ( this.persona === agent && this )
  || agent.get_non_neutral_vote_on( this.proposition );
  if( !Vote.valid( agent_vote ) )return false;
  
  var existing_vote
  = ( this.persona === persona && this )
  || persona.get_non_neutral_vote_on( this.proposition );
  
  // Delegation cannot override an existing non neutral direct vote
  if( existing_vote
  && existing_vote.delegation() === Vote.direct
  && existing_vote.orientation() !== Vote.neutral
  )return false;
  
  // Neutral vote delegation is useful only to erase an existing vote
  // ToDo: this case does not exist anymore
  var agent_orientation = agent_vote.orientation();
  if( agent_orientation === Vote.neutral ){
    if( !existing_vote || existing_vote.orientation() === Vote.neutral )return false;
  }
  
  de&&bug( "Delegated vote by " + agent
      + " on behalf of " + persona
      + " for proposition: " + this.proposition
      + ", orientation: " + agent_orientation
  );
  
  // Deactivate delegation if it loops
  if( delegation.agent.delegates_to( persona, delegation.tags ) ){
    trace( "Deactivate looping delegation " + delegation );
    delegation.inactive( true );
    return false;
  }
  
  var vote = Vote.inject({
    persona:     persona,
    delegation:  delegation,
    proposition: this.proposition,
    orientation: agent_orientation
    // ToDo: duration? until delegation expiration?
  });
  
  // Remember all votes due to the delegation, for future updates
  // ToDo: move to vote processing side
  delegation.track_vote( vote );
  return true;
};


Vote.prototype.set_comment = function( comment ){
  if( !comment )return this;
  this.touch();
  this.comment( comment );
  // Comments can occur after vote's value was logged, see Topic.log_vote()
  var text = comment.text;
  if( this.snapshot ){
    this.snapshot.comment_text = text;
  }
  // If comment is about a persona's topic, invalidate cached alias
  var persona = this.proposition.get_persona();
  if( persona ){
    persona._cached_alias = _;
  }
  return this;
};


/*
 *  Result (of votes on a topic)
 */

Ephemeral.type( Result );
function Result( options ){
  
  if( !Topic.valid( options.proposition ) )return null;
  
  var result = this.register( "&r." + options.proposition.id );
  if( !result )return null;
  var plasma = this.plasma( result );

  this.proposition = options.proposition;
  this.label       = this.proposition.label;
  this.blank       = plasma( options.blank     || 0 );
  this.protest     = plasma( options.protest   || 0 );
  this.agree       = plasma( options.agree     || 0 );
  this.disagree    = plasma( options.disagree  || 0 );
  this.direct      = plasma( options.direct    || 0 );
  this.count       = plasma( 0 );
  this._added_votes = {};
  this.proposition.touch();
  this.touch();

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
    result.count(    this.count    );
    return result;
  }
  
  // Computed attributes, including orientation transition detection
  
  this.total = function(){
    var r = this;
    r.count( r.count() + 1 );
    r.touch();
    var old = r.total();
    var t = r.blank()
    + r.protest()
    + r.agree()
    + r.disagree();
    de&&bug( "  Total for " + r, "is:", t, "was:", old,
      "direct:", r.direct()
    );
    return t;
  }.when( this.blank, this.protest, this.agree, this.disagree );
  this.total( 0 );
  de && ( this.total.label = "total" );
  
  this.against = function(){
    var r = this;
    var old = r.against();
    var t = r.disagree() + r.protest();
    de&&bug( "  Against about " + r, "is:", t, "was:", old );
    if( t === old ){
      var votes_log = r.proposition.votes_log();
      var current_vote = votes_log[ votes_log.length -1 ].entity;
      if( current_vote !== Vote.current ){
        trace(
          "BUG? last logged vote is not the currently injected one.",
          "last: " + current_vote,
          "current: " + Vote.current
        );
      }
      if( !current_vote.was ){
        trace( "BUG? recomputed 'against' despite no new vote.",
          "result: " + r,
          "vote: " + current_vote
        );
        debugger;
      }else if( current_vote.was.orientation === current_vote.orientation() ){
        var old_delegation
        = Delegation.find( current_vote.was.delegation ) || Vote.direct;
        var new_delegation
        = current_vote.delegation() || Vote.direct;
        if( new_delegation === old_delegation ){
          trace(
            "BUG? recomputed 'against' despite no change, weird. ",
            "result: " + r,
            "vote: " + current_vote
          );
        }
        //debugger;
      }
    }
    return t;
  }.when( this.disagree, this.protest );
  this.against( 0 );
  de && ( this.against.label = "against" );
  
  this.win = function(){
    var r = this;
    var old = r.win();
    var t = r.agree() > r.against();
    de&&bug( "  Win about " + r, "is:", t, "was:", old );
    return t;
  }.when( this.agree, this.against );
  this.win( false );
  de && ( this.win.label = "win" );
  
  this.orientation = function(){
    var r = this;
    var old = r.orientation() || Vote.neutral;
    var now;
    //if( this.proposition.id === 10017 )de&&bugger();
    de&&bug( "  Computing orientation for " + r,
      "expired:", r.expired(),
      "agree:",   r.agree(),
      "against:", r.against(),
      "protest:", r.protest(),
      "blank:",   r.blank()
    );
    if( r.expired() ){
      now = Vote.neutral;
    }else if( r.agree() > r.against() ){
      // Won
      if( r.agree() > r.blank() ){
        // agree > blank, > against
        now = Vote.agree;
      }else{
        // blank > agree, > against
        now = Vote.blank;
      }
    }else{
      // Lost
      if( r.disagree() > r.blank() ){
        if( r.disagree() > r.protest() ){
          now = Vote.disagree;
        }else{
          now = Vote.protest;
        }
      }else{
        if( r.blank() > r.protest() ){
          now = Vote.blank;
        }else{
          now = r.protest() > 0 ? Vote.protest : Vote.neutral;
        }
      }
    }
    de&&bug( "  Computed orientation " + r, "was:", old, "is:", now ); //, value( this, true ) );
    if( now !== old ){
      de&&bug( "  Change of orientation, create a transition" );
      //debugger;
      Transition.inject({ result: r, orientation: now, previously: old });
      return now;
    }
    // Else don't produce a new value
    return _;
  }.when( this.agree, this.against, this.blank );

  this.orientation( Vote.neutral );
  de && ( this.orientation.label = "orientation" );

  return this;
}


Result.prototype.valid = function(){
  return this.proposition.valid() ? this : null;
};


Result.prototype.touch = function(){
  this.time_touched = Kudo.now();
  // Result should live longer than the proposition it is about
  this.outlive( this.proposition );
};


Result.prototype.is_tie = function(){
  return ( this.agree() === this.against() ) && this.total();
};


Result.prototype.is_win = function(){
  return this.win();
};


Result.prototype.is_abuse = function(){
  return this.orientation() === Vote.protest;
};


Result.prototype.is_referendum = function(){
  return this.total() * 100 > Persona.count && this.total() > 1;
};


Result.prototype.is_problematic = function(){
// A proposition is problematic if the number of protest votes exceeds 1%
// of the number of agree votes.
  return this.protest() * 100 > this.agree();
};


Result.prototype.add_vote = function( vote ){
// Called by topic.add_vote()
  De&&mand( vote.proposition === this.proposition );
  // Neutral votes have no more impacts
  if( vote.orientation() === Vote.neutral )return this;
  if( this._added_votes[ vote.persona.id ] ){
    trace( "BUG, same vote added multiple times, vote: " + vote );
    debugger;
    return this;
  }else{
    this._added_votes[ vote.persona.id ] = vote.orientation();
  }
  var orientation = vote.orientation();
  var counter = this[ orientation ];
  var count = counter();
  de&&bug(
    "add_vote on " + this, "orientation", orientation,
    "from", count, "to", count + 1, "vote:" + vote
  );
  counter( count + 1  );
  De&&mand( counter() === count + 1 );
  if( vote.delegation() === Vote.direct ){
    this.direct( this.direct() + 1 );
  }
  return this;
};


Result.prototype.remove_vote = function( was ){
// Called by topic.remove_vote()
  De&&mand( was.proposition === this.proposition.id );
  De&&mand( was.persona );
  var was_orientation = was.orientation;
  var added_orientation = this._added_votes[ was.persona ];
  if( !added_orientation ){
    trace(
      "Bug, removed vote was never added"
      + ", vote of: " + was.persona + ", orientation: " + was.orientation
      + ", proposition: " + was.proposition
    );
    // ToDo: fix this!
    //debugger;
    return this;
  }else if( added_orientation !== was_orientation ){
    trace(
      "Bug, removed vote was added with a different orientation"
      + ", vote of: " + was.persona + ", orientation: " + was_orientation
      + ", added orientation: " + was_orientation
      + ", proposition: " + was.proposition
    );
    // ToDo: fix this
    was_orientation = added_orientation;
  }
  this._added_votes[ was.persona ] = null;
  // Nothing was done when neutral vote was added, nothing needed now either
  if( was_orientation === Vote.neutral )return this;
  var counter = this[ was_orientation ];
  var count = counter();
  de&&bug(
    "remove_vote on " + this, "orientation", was_orientation,
    "from", count, "to", count - 1, "vote: " + was.id
  );
  De&&mand( count > 0 );
  counter( count - 1 );
  De&&mand( counter() === count - 1 );
  if( was.delegation === Vote.direct ){
    var old_d = this.direct();
    De&&mand( old_d > 0 );
    this.direct( old_d - 1 );
  }
  return this;
};


Result.prototype.indirect = function(){
  return this.total() - this.direct();
};


/*
 *  Transition event entity.
 *
 *  A transition is the event that occurs when the consolidated orientation
 *  changes on a topic.
 */
 
Event.type( Transition );
function Transition( options ){
  De&&mand( options.result );
  De&&mand( options.orientation );
  De&&mand( options.previously );
  this.result      = options.result;
  this.orientation = options.orientation;
  this.previously  = options.previously;
}


/*
 *  Delegation filter.
 *
 *  A delegation filter is a list of tags. A delegation involves a personna,
 *  an agent and a filter (aka "a delegation expert"). Some filters are more
 *  popular than others.
 *
 *  Note: this is a class for internal purposes only. It is not visible from
 *  the outside.
 */

function DelegationFilter( tags ){
  // Build label using tags labels, sorted alpha
  var labels = [];
  Ephemeral.each( tags, function( tag ){
    labels.push( tag.label );
  });
  labels = labels.sort( function( a, b ){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
  });
  var label = labels.join( "." );
  var tags_string = labels.join( " " );
  // Id is lowercase
  var id = label.toLowerCase();
  var found = DelegationFilter.all[ id ];
  if( found )return found;
  this.label = label;
  this._tags_string = tags_string;
  this.id = id;
  this.count_votes = 0;
  this._delegation_expertizes = [];
  DelegationFilter.all[ id ] = this;
  trace( "New DelegationFilter", label );
  return this;
}


DelegationFilter.all = {};


DelegationFilter.register = function( tags ){
  return new DelegationFilter( tags );
};


DelegationFilter.find = function( id ){
  return DelegationFilter.all[ id ];
};


DelegationFilter.prototype.tags_string = function(){
  return this._tags_string;
};


Delegation.prototype.is_entity = true;


/*
 *  Delegation expertize
 *
 *  A delegation expert is an agent and a delegation filter. Some experts are
 *  more popular than others. The delegation filter is a list of tags. 
 *
 *  Note: this is a class for internal purposes only. It is not visible from
 *  the outside.
 */

function DelegationExpertize( delegation ){
  var agent = delegation.agent;
  if( !agent ){
    trace( "Bug? bad delegation, no agent" );
    debugger;
    return null;
  }
  var tags  = delegation.tags;
  var delegation_filter = new DelegationFilter( tags );
  var id = agent.id + "." + delegation_filter.id;
  var found = DelegationExpertize.all[ id ];
  if( found ){
    return found;
  }
  this.label = agent.label + "." + delegation_filter.label;
  this.id = id;
  this.agent = agent;
  this.delegation = delegation;
  this._delegation_filter = delegation_filter;
  this.count_votes = 0;
  agent._delegation_expertizes.push( this );
  DelegationExpertize.all[ id ] = this;
  delegation_filter._delegation_expertizes.push( this );
  trace( "New DelegationExpertize", this.label );
  return this;
}


DelegationExpertize.all = {};


DelegationExpertize.register = function( delegation ){
  return new DelegationExpertize( delegation );
};


DelegationExpertize.is_entity = true;


DelegationExpertize.prototype.track_vote = function( vote ){
  this.count_votes++;
  this.delegation.count_votes++;
  this.agent.count_indirections++;
  this._delegation_filter.count_votes++;
};


DelegationExpertize.prototype.tags_string = function(){
  return this._delegation_filter.tags_string();
};


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
 *  The template should provide a default agent
 */

Ephemeral.type( Delegation );
function Delegation( options ){
  
  // If create, check parameters
  if( !options.id_key ){
    if( !Persona.valid( options.persona ) )return null;
    if( !Persona.valid( options.agent ) )return null;
    if( options.persona === options.agent )return null;
    if( !options.tags )return null;
    if( !options.tags.length )return null;

    
  // If update, check that the entity actually (still) exists
  }else{
    if( !Delegation.find( options.id_key ) ){
      trace(
        "BUG, attempt to update a non existent Delegation, id: "
        + options.id_key
      );
      // debugger;
      return null;
    }
  }

  var key = options.id_key;
  var label;
  
  if( key ){
    // Cannot change tags
    if( options.tags )return null;
  }else{
    
    var tags = options.tags;
    if( !tags )return null;
    if( !tags.length )return null;
    var tag;
    var valid_tags = [];
    var topic;
    var labels = [];
    var ids = [];
    var ii;
    var tlen = tags.length;
    
    for( ii = 0 ; ii < tlen ; ii++ ){
      tag = tags[ ii ];
      topic = Topic.valid( tag );
      if( !topic )return null;
      if( !topic.is_tag() )return null;
      if( valid_tags.indexOf( topic ) !== -1 )continue;
      valid_tags.push( topic );
    }
    
    valid_tags = valid_tags.sort( function( a, b  ){
      return a.id > b.id ? 1 : -1;
    });
    options.tags = valid_tags;
    
    tlen = valid_tags.length;
    for( ii = 0 ; ii < tlen ; ii++ ){
      tag = valid_tags[ ii ];
      ids.push( tag.id );
      labels.push( tag.label );
    }
    
    key = "" 
    + options.persona.id
    + "."
    + options.agent.id
    + "."
    + ids.join( "." );
    
    label = ""
    + options.persona.label
    + "."
    + options.agent.label
    + "."
    + labels.join( "." );
    
  }
  
  var delegation = this.register( key );
  if( !delegation )return null;
  var plasma = this.plasma( delegation );

  var persona   = options.persona || delegation.persona;
  var agent     = options.agent   || delegation.agent;
  if( !persona || !agent )return null;

  // Delegation are transitive, there is a risk of loops
  if( !options.inactive
  && agent.delegates_to( persona, options.tags || delegation.tags )
  ){
    trace( "Loop detected for delegation " + delegation );
    // ToDo: should provide a "reason" to explain the deactivation
    options.inactive = true;
  }

  this.persona  = persona;
  this.agent    = agent;
  this.votes    = plasma( [] ); // Votes done because of the delegation
  this.tags     = options.tags;
  this.inactive = plasma();

  if( this.is_update() ){
    var new_duration = options.duration;
    if( new_duration ){
      if( false && new_duration < delegation.duration ){
        trace( "BUG? Cannot reduce duration, set inactive instead" );
        this.inactive = true;
      }else{
        delegation.set_duration( options.duration );
      }
    }
    // If change to activation flag only
    delegation.inactive( this.inactive );
    return delegation;
  }

  this.label    = label;
  this._delegation_expertize = DelegationExpertize.register( this );
  this.count_votes = 0;
  // this.previous_tags     = null;
  this.was_inactive = true;
  var w = plasma( _,  error_traced( update ), [ this.inactive ] );
  w.delegation = this;

  // Fire initial update
  this.tags = options.tags;
  this.inactive( true );
  if( !options.inactive ){
    water.effect( function(){
      delegation.inactive( false );
    });
  }
  this.persona.add_delegation( this );
  return this;

  function update(){
    //debugger;
    var delegation  = water.current.delegation;
    var inactive    = delegation.inactive();
    var need_update = false;
    // If change in activation
    if( inactive !== delegation.was_inactive ){
      need_update = true;
      delegation.was_inactive = inactive;
      // Delegation became active
      if( !inactive ){
        de&&bug( "Activate delegation " + delegation );
        // Refuse to activate a delegation that loops
        if( delegation.agent.delegates_to( delegation.persona, delegation.tags ) ){
          trace( "Looping delegation is deactivated ", pretty( delegation ) );
          // ToDo: provide some explanation about why activation was refused
          delegation.inactive( true );
        }
        // Delegation becomes inactive
      }else{
        de&&bug( "Deactivate delegation " + delegation );
        // I will remove votes due to the delegation if another delegation
        // can override the previous vote.
        need_update = true;
      }
    }
    // Update existing votes and make new delegated votes
    if( need_update ){
      delegation.update_votes();
    }
  }
}


Delegation.prototype.valid = function(){
  if( this.expired() )return false;
  if( !Persona.valid( this.agent ) )return false;
  return true;
};


Delegation.prototype.is_active = function(){
  return !this.inactive();
};


Delegation.prototype.is_inactive = function(){
  return !this.is_active();
};


Delegation.prototype.filter_string = function( persona ){
  var buf = [];
  Ephemeral.each( this.tags, function( tag ){
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


Delegation.prototype.filtered = function( filter, query, persona ){

  if( this.expired( ) )return false;
  if( this.agent.expired() )return false;
  if( !filter )return true;
  return this.is_tagged( filter, persona );
  // ToDo: handle search query
};


Delegation.prototype.is_tagged = function( tags, persona ){
// Returns true if a delegation includes all the specified tags
  if( typeof tags === "string" ){
    return string_tags_includes( this.tags_string( persona ), tags );
  }
  return tags_includes( this.tags, tags, this.agent.label.substring( 1 ) );
};


Delegation.prototype.tags_string = function( persona ){
  var tags_str = [];
  var sorted_tags = this.tags.sort( function( a, b ){
    return a.heat() - b.heat();
  });
  Ephemeral.each( sorted_tags, function( tag ){
    tags_str.push( tag.label );
  });
  return tags_str.join( " " ); // + this.computed_tags();
};


Delegation.prototype.update_votes = function(){
  if( this.buried )return;
  var delegation = this;
  var tags     = delegation.tags;
  var inactive = delegation.inactive();
  Ephemeral.each( delegation.votes, function( vote ){
    // Check that vote is still delegated as it was when last updated
    if( vote.delegation() !== delegation )return;
    // Does the delegation still include the voted proposition?
    var included = delegation.includes_proposition( vote.proposition );
    // If tags changed (tags of the proposition) or agent's mind change
    var new_orientation
    = ( !inactive 
      && included
      && delegation.agent.get_agent_orientation_on( vote.proposition )
    ) || Vote.neutral;
    if( new_orientation && new_orientation !== vote.orientation() ){
      // Change vote to neutral direct, this may trigger another delegation
      Vote.inject({
        persona: vote.persona,
        delegation: Vote.direct,
        proposition: vote.proposition,
        orientation: new_orientation
      });
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
  var sorted_tags = tags;
  sorted_tags = sorted_tags.sort( function( a, b ){
    return a.propositions().length - b.propositions().length; }
  );
  Ephemeral.each( sorted_tags, function( tag ){
    // Start with a set of topics, the smaller one
    if( !candidate_propositions ){
      candidate_propositions = tag.propositions().slice();
      // Keep topics that are also tagged with the other tags
    }else{
      var propositions = tag.propositions();
      Ephemeral.each( tag.propositions, function( proposition, idx ){
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
      var orientation = delegation.agent.get_agent_orientation_on( proposition );
      if( orientation ){
        // Look for an existing direct vote, if any
        var existing_vote = Vote.find( delegation.persona.id + "." + proposition.id );
        if( existing_vote ){
          // Only a non neutral direct vote counts as an existing vote
          if( existing_vote.orientation() === Vote.neutral
          ||  existing_vote.delegation()  !== Vote.direct
          ){
            existing_vote = null;
          }
        }
        // Create a vote if no existing vote prevails
        if( !existing_vote ){
          de&&bug( "New delegation implies vote of " + delegation.persona
            + " thru agent " + delegation.agent
            + " on proposition " + proposition
            + ", orientation: " + orientation
          );
          Vote.inject( {
            persona:     delegation.persona,
            delegation:  delegation,
            proposition: proposition,
            orientation: orientation
          });
        }
      }
    });
  }
  return this;
};


Delegation.prototype.track_vote = function( vote ){
// Called when a persona vote is created due to the agent voting
  if( !vote ){
    trace( "BUG? attempt to track a non existant vote" );
    debugger;
    return;
  }
  if( !vote.proposition ){
    trace( "BUG? attempt to track a vote without a proposition:" + vote );
    debugger;
    return;
  }
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
  return tags_includes( tags, this.tags );
};


Delegation.prototype.includes_proposition = function( proposition ){
  return this.includes_tags( proposition.tags() );
};


Delegation.prototype.delegates_to = function( agent, tags, seen ){
  if( !this.is_active() )return false;
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
      return true;
    }else{
      return false;
    }
  }
  return false;
};


/*
 *  Membership entity.
 *
 *  They make personas members of group personas.
 */

Ephemeral.type( Membership );
function Membership( options ){
  
  if( !Persona.valid( options.member ) )return null;
  if( !Persona.valid( options.group ) )return null;
  assert( options.group.is_group() );

  var key = "&m." + options.member.id + "." + options.group.id;
  var membership = this.register( key );
  if( !membership )return null;

  if( this.is_create() ){
    this.member   = options.member;
    this.group    = options.group;
    this.member.add_membership( this );
    this.inactive = plasma();
    this.inactive.membership = this;
    this.inactive( _, update, [ !!options.inactive ] );
  }else{
    membership.inactive( !!options.inactive );
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


var replized_verbs      = Kudo.replized_verbs      = {};
var replized_verbs_help = Kudo.replized_verbs_help = {};

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
    De&&mand( p ); De&&mand( t );
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


function main( starter ){

  trace( "Welcome to Kudocracy -- Liquid demo... cracy" );

  //Ephemeral.force_bootstrap = true;
  // With or without a lot of traces
  Kudo.debug_mode( de = false ); // false );
  
  Ephemeral.start( bootstrap, function( err ){
    if( err ){
      trace( "Cannot proceed", err, err.stack );
      //process.exit( 1 );
      return;
    }
    // Let's provide a frontend...
    trace( "READY!" );
    starter( Kudo );
  } );
}


exports.start = function( starter ){
  l8.begin.step( function(){ main( starter ); } ).end;
};



