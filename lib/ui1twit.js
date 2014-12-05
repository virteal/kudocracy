//  ui1twit.js
//    First UI for Kudocracy, test/debug UI, HTTP based, Twitter aspects
//
// Dec 4 2014 by @jhr

"use strict";

/*
 *  Some global imports
 */

var Ui1Server; 
var Kudo
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
  Kudo.TwitterUser = TwitterUser;
  Kudo.MonitoredPersona = MonitoredPersona;
}


/* ---------------------------------------------------------------------------
 *  Twitter user class
 */

var AllTwitterUsers = {};
var TwitterUserByScreenName = {};
var TwitterFriendsByScreenName = {};

function TwitterUser( twitter_user_data, persona ){
  var screen_name = twitter_user_data.screen_name;
  var id = screen_name.toLowerCase();
  var user = AllTwitterUsers[ id ];
  var machine = Ephemeral.Machine.current;
  if( user ){
    // trace( "Twitter, update user", id );
    if( persona ){
      persona.twitter_user = user;
    }
    user.twitter_user_data = twitter_user_data;
    if( user.machines.indexOf( machine ) === -1 ){
      user.machines.push( machine );
      user.persona_by_machine_id[ machine.id ] = persona;
    }
    return user;
  }
  // trace( "Twitter, create user", id );
  this.id = id;
  AllTwitterUsers[ id ] = this;
  this.screen_name = screen_name;
  this.twitter_user_data = twitter_user_data;
  this.persona = null; // in main machine, if ever
  this.machines = [ machine ];
  this.persona_by_machine_id = {};
  this.persona_by_machine_id[ machine.id ] = persona;
  if( persona ){
    persona.twitter_user = this;
  }
  return this;
}


TwitterUser.find_persona = function( screen_name, machine ){
  var user = AllTwitterUsers[ screen_name.toLowerCase() ];
  if( !user )return null;
  if( !machine ){
    machine = Ephemeral.Machine.current;
  }
  return user.persona_by_machine_id[ machine.id ];
};


TwitterUser.lookup = function( screen_name ){
  return AllTwitterUsers[ screen_name.toLowerCase() ];
};


TwitterUser.prototype.toString = function(){
  return "@" + this.screen_name;
};


/* ---------------------------------------------------------------------------
 *  MonitoredPersona class
 */

// npm install twit - https://github.com/ttezel/twit
var Twit = require( "twit" );

var AllPersonas = [];
var AllMonitoredPersonas = [];
var AllMonitoredPersonasById = {};


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
  Ephemeral.Machine.main.activate();
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
    that.open_user_stream();
  });
  Ephemeral.Machine.main.activate();
  
}


MonitoredPersona.current = null;

var Proto = MonitoredPersona.prototype;


Proto.toString = function(){
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
  Proto[ event_name ] = function( event ){
    LastEvent = event;
    LastEventMonitoredPersona = this;
    MonitoredPersona.current = this;
    var fn = Proto[ "process_" + event_name ];
    if( fn ){
      trace( 'Twitter event "' + event_name + '" about ' + this );
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


Proto.open_user_stream = function(){
  var stream = this.stream 
  = this.twit.stream( "user", {
    with: "followings",
    stall_warning: "true",
    track: "kudocracy" // from the public stream, ie not within followings
  } );
  var that = this;
  event_names.forEach( function( event_name ){
    stream.on( event_name, Proto[ event_name ].bind( that ) );
  });
  return this;
};


Proto.process_friends = function( event ){
  // Get list of friend ids
  var friends = event.friends;
  var that = this;
  // Get info on next 100 friends
  var start = event.lookup_start || 0;
  if( start > friends.length )return;
  var friends_slice = friends.slice( start, start + 100 );
  event.lookup_start = start + 100;
  trace( "Twitter, send users/lookup request about " + this );
  var params = { user_id: friends_slice, include_entities: false };
  this.twit.get(
    "users/lookup", params,
    Proto.process_users_lookup_response.bind( that, event )
  );
};


Proto.process_response = function( err, data, response ){
  trace( "Twitter response received about " + this );
  if( err ){
    trace( "Twitter response error", err );
    debugger;
    return true;
  }
  return false;
};


Proto.process_users_lookup_response = function( event, err, data, response ){

  if( this.process_response( err, data, response ) )return;
  var that = this;
  that.machine.activate();

  data.forEach( function( user ){
      
    var twitter_user = new TwitterUser( user );
      
    var screen_name = user.screen_name;
    user.time_touched = l8.update_now();
    
    TwitterUserByScreenName[ user.screen_name ] = twitter_user;
    
    // Add to list of friends of domain
    var friends = TwitterFriendsByScreenName[ screen_name ];
    if( !friends ){
       friends = TwitterFriendsByScreenName[ screen_name ] = {};
    }
    friends[ screen_name ] = twitter_user;
    
    // Is there a matching Persona
    // ToDo: should look at main engine machine in addition to domain level one
    var persona = Persona.find( "@" + user.screen_name );
    if( !persona ){
      // This friend is not know yet
      // trace( "Twitter unkown friend", user.screen_name, "of " + that.persona );
    }else{
      // This friend is known, attach twitter user info to the persona
      trace(
        "Twitter user", screen_name, "found for " + persona,
        "friend of " + that.persona
      );
      TwitterUser( user, persona );
      user.kudo_persona = persona;
      if( that.machine === Ephemeral.MainMachine ){
        twitter_user.persona = persona;
      }
    }
  });
  
  Ephemeral.Machine.main.activate();
  
  // Process next 100 friends
  this.process_friends( event );

};


Proto.process_tweet = function( event ){
  var text = event.text;
  // If retweet, ignore RT @xxxx : prefix
  if( text[0] === "R" && text[1] === "T" ){
    var idx = text.indexOf( ":" );
    if( idx === -1 ){
      return;
    }
    text = text.substring( idx + 2 );
  }
  var from = event.user.screen_name;
  var match = "kudo ";
  var for_cli = true;
  if( text.substring( 0, match.length ) !== match ){
    match = "kudocracy ";
    if( text.substring( 0, match.length ) !== match ){
      for_cli = false;
    }
  }
  var twitter_user = TwitterUser.lookup( from );
  if( !twitter_user ){
    trace(
      "BUG? twitter tweet from unknow (new?) user ", from, "text:", text
    );
    return;
  }
  if( !for_cli ){
    // trace( "Twitter, ignored tweet from " + twitter_user, "text:", text );
    return;
  }
  cli( event, twitter_user, text.substring( match.length ) );
};


Proto.process_direct_message = function( event ){
  var for_cli = true;
  var msg = event.direct_message;
  var to = msg.recipient_screen_name;
  // Ignore direct messages between users, only catch those for me
  if( to.toLowerCase() !== MonitoredPersona.current.screen_name ){
    trace( "mismatch", to, "with", MonitoredPersona.current.screen_name );
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
    }
  }
  var twitter_user = TwitterUser.lookup( from );
  if( !twitter_user ){
    trace(
      "BUG? twitter direct message from unknown (new?) user ", from, "to", to
    );
    return;
  }
  if( !for_cli ){
    trace( "Twitter, ignored direct message from " + twitter_user, "to", to );
    return;
  }
  cli( event, twitter_user, text );
  
};


Proto.send_direct_message = function( to, text ){
  trace( "Twitter, send direct message to", to, "text:", text );
  this.twit.post( "direct_messages/new", {
    screen_name: to.screen_name || to,
    text: text.substring( 0, 140 )
  }, Proto.process_response.bind( this ) );
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
  "block":      "disagree",
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
  "abstain": "blank",
  "nota":    "blank",
  "blanco":  "blank",
  "branco":  "blank",
  
  "hesitate": "neutral",
  "pass":     "neutral",
  "skip":     "neutral",
  "j'hesite": "neutral",
  "neutre":   "neutral",
  
  
  "abuse": "protest",
  "abus":  "protest",
  
  "eol": "eol"
};


var verbs = {
  
  "help":  cli_help,
  "aide":  cli_help,
  
  "vote":  cli_vote,
  "voter": cli_vote,
  "votez": cli_vote,
  
  "delegate": cli_delegate,
  "via":      cli_delegate,
  "delegue":  cli_delegate,
  "deleguer": cli_delegate,
  "deleguez": cli_delegate
  
};


function cli( event, user, text ){

  var raw_text
  = text
  .replace( /[^A-Za-z0-9_@#!?/'\-\.]/g, " " )
  .replace( /  /g, " " ).trim();
  trace( "Twitter KUDO message for " + MonitoredPersona.current, "from " + user, "text:", raw_text );
  
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
    var syn = synonyms[ t ];
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
  
  debugger;
  
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


function cli_help( data ){
  trace( "Twitter cli, help request by " + data.user );
  // Send confirmation direct message
  var sender = MonitoredPersona.current;
  var domain = "";
  if( sender.domain_name ){
    domain = "?domain=" + sender.domain_name;
  }
  sender.send_direct_message( data.user.screen_name,
    "kudo help"
    + " -- #kudocracy http://" + Ui1Server.get_config().host
    + "/help"
    + domain
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
  var sender = MonitoredPersona.current;
  var domain = "";
  if( sender.domain ){
    domain = "?domain=" + sender.screen_name;
  }
  sender.send_direct_message( persona.label.substring( 1 ),
    "kudo vote " + data.orientation + " " + data.hashtag
    + " -- #kudocracy http://" + Ui1Server.get_config().host
    + "/proposition/" + encodeURIComponent( proposition.label )
    + domain
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
 *  Start monitoring. Main entry point.
 */

exports.start = function( ui1_server ){
    
  // Import stuff from main.js, shared with ui1_server defined in ui1core.js
  Ui1Server = ui1_server;
  process_kudo_imports( ui1_server.get_kudo_scope() );
  
  console.log( "Ready to listen for Twitter events" );
  
  // Collect initial list of personas to monitor
  Ephemeral.each( Persona.all, function( persona ){
    if( !persona.is_domain() )return;
    var domain = persona.get_topic().get_data( "domain" );
    if( !domain )return;
    if( !domain.twitter_consumer_key )return;
    new MonitoredPersona( persona, domain );
  });
  
};
