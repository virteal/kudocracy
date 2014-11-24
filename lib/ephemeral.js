// lib/ephemeral.js
//   in memory reactive dataflow database with ephemeral entities
//
// june 2014 by @jhr, move from l8/test/votes.js, 1730 LOC

"use strict";

function ephemeral( exports ){

exports.version = "0.1";

var l8 = exports.l8 = require( "l8/lib/l8.js"    );

// Boxons are similar to promises, but very light
var boxon = exports.boxon = require( "l8/lib/boxon.js" );
var moxon = boxon.moxon;

// Water sources are reactive variables
var water = exports.water = require( "l8/lib/water.js" );

// Fluids are streams of piped data
var fluid = exports.fluid = water.fluid;

// I use the "fast" version, without bufferisation, or else some updates fail
var plasma = water.plasma;

// My de&&bug() darling, traces that can be disabled with low overhead
var De        = true;   // For De&&mand() style of asserts
var de        = false;  // For de&&bug() style traces
var nde       = false;  // Negated, ie 'off'
var fde       = true;   // Forced, ie 'on'
var debugging = true;   // Interactive mode, useful to debug test cases
var trace     = exports.trace = l8.trace;
var bug       = exports.bug   = trace;

var debug_mode  = function( x ){
// Get/set debug mode
  if( arguments.length ){
    de = !!x;
  }
  return de;
};
exports.debug_mode = debug_mode;

function mand( b, msg ){
// De&&mand() is like assert()
  if( b )return;
  var tmp = msg ? ": " + msg : "";
  bug( "l8/test/vote.js, assert error " + tmp );
  if( de && debugging )debugger;
  if( ! (de && debugging ) )throw new Error( "vote.js assert" );
}
exports.assert = mand;


function bugger(){ 
// de&&bugger() invokes the debugger only in debugging mode
  if( debugging )debugger;
}
exports.bugger = bugger;


function error_traced( f ){
// error_traced( fn ) is like fn but with exceptions traced in debug mode
  return !de ? f : function(){
    try{
      return f.apply( this, arguments );
    }catch( err ){
      trace( "Error", err, err.stack );
      if( debugging ){
        debugger;
      }else{
        throw err;
      }
    }
  };
}
exports.error_traced = error_traced;


// Misc. util

function noop(){}

var _ = exports._ = noop();      // _ === undefined

var extend = function( to, from ){
// Fast inject of properties. Note: not just owned ones, prototype's too
  for( var attr in from ){
    if( attr !== "__proto__" ){
      to[ attr ] = from[ attr ];
    }
  }
  return to;
};
exports.extend = extend;

/*
 *  array_diff() make it easy to detect changes in array. Such arrays are
 *  actually "sets" 
 */

var cached_array_diff = {};

function array_diff( old, now, no_cache ){
// Compare two sets of objects and detect changes.
// Returns { old:[.], now:[.], added:[.], removed:[.], kept:[.], changes: nn );

  if( !old ){ old = [] }
  if( !now ){ now = [] }

  // No old?
  if( !old.length ){
    return cached_array_diff = {
      old:     old,
      now:     now,
      added:   now,
      removed: [],
      kept:    [],
      changes: now.length
    };
  }

  // No new
  if( !now.length ){
    return cached_array_diff = {
      old:     old,
      now:     now,
      removed: old,
      added:   [],
      kept:    [],
      changes: old.length
    };
  }
  
  // Return cached value if diff about same arrays
  // ToDo: that won't work if array content got changed, ie mutable arrays
  if( old === cached_array_diff.old
  &&  now === cached_array_diff.now
  && !no_cache
  )return cached_array_diff;
  
  // Detect additions and deletions
  var added   = [];
  var removed = [];
  var kept    = [];
  
  // Check which old entries were kept
  old.forEach( function( v ){
    if( now.indexOf( v ) === -1 ){
      removed.push( v );
    }else{
      kept.push( v );
    }
  });
  
  // Check which new entries did not exist
  now.forEach( function( v ){
    if( old.indexOf( v ) === -1 ){
      added.push( v );
    }
  });
  
  return cached_array_diff = {
    old:     old,
    now:     now,
    added:   added,
    removed: removed,
    kept:    kept,
    changes: added.length + removed.length
  };
}
exports.diff = array_diff;


/*
 *  Frozen time management.
 *  When log of action is replayed, time moves to follow the actions time.
 *  After log is replayed, frozen time gets back to normal.
 */
 

function now(){
// A now() that can be frozen (during restore)
  return now.now || l8.now;
}


exports.now = now;


var FrozenTimeoutQueueHead = null;


function FrozenTimeout( when, what ){
  
  this.when = when;
  this.what = what;
  
  // Insert new entry in sorted linked list
  // ToDo: is it too slow when there are tons of timeouts? Not scalable.
  
  var previous = FrozenTimeoutQueueHead;
  // If "first", new entry becomes the head of the list
  if( !previous ){
    FrozenTimeoutQueueHead = this;
  // Else, if before first, insert at new head
  }else if( previous.when > when ){
    this.next = previous;
    FrozenTimeoutQueueHead = this;
  // Else, insert inside linked list, before node that comes later
  }else{
    var next;
    while( true ){
      next = previous.next;
      if( !next )break;
      if( next.when > when )break;
      previous = next;
    }
    this.next = next;
    previous.next = this;
  }
  
  if( FrozenTimeoutQueueHead
  &&  FrozenTimeoutQueueHead.next
  &&  FrozenTimeoutQueueHead.when > FrozenTimeoutQueueHead.next.when
  ){
    trace( "BUG? out of order head of queued frozen timeouts" );
    debugger;
  }
  
  return this;
  
}


function freezableSetTimeout( what, delay ){
  
  var frozen_now = now.now;
  
  // If time is not frozen, use normal setTimeout()
  if( !frozen_now )return setTimeout( what, delay );

  return new FrozenTimeout( frozen_now + delay, what );
}


exports.setTimeout = freezableSetTimeout;


var set_now_is_active = false;


function set_now( when ){
// Freeze or defreeze time. Bombs ready queued timeouts.
  
  var old_now = now.now;
  if( !old_now && when ){
    trace( "BUG? late call to set_now()", when );
    debugger;
    return;
  }
  
  now.now = when;
  
  // if( !when )debugger;
  
  // Don't reenter
  if( set_now_is_active )return;
  set_now_is_active = true;
  
  var head;
  
  // Run all ready frozen timeouts
  while( true ){
    var frozen_now = now.now;
    if( !frozen_now )break;
    head = FrozenTimeoutQueueHead;
    if( !head )break;
    if( frozen_now < head.when )break;
    // Head time has come, ready to bomb
    FrozenTimeoutQueueHead = head.next;
    head.next = _;
    try{
      head.what.call();
    }catch( err ){
      trace( "FrozenTimeout error", err, err.stack );
      debugger;
    }
    head.when = head.what = _;
  }
  
  // Schedule remaining frozen timeouts using normal setTimeout()
  if( !now.now ){
    var true_now = l8.update_now();
    while( true ){
      head = FrozenTimeoutQueueHead;
      if( !head )break;
      FrozenTimeoutQueueHead = head.next;
      head.next = _;
      var delay = head.when - true_now;
      if( delay <= 0 ){
        try{
          head.what.call();
        }catch( err ){
          trace( "FrozenTimeout defreeze err", err, err.stack );
        }
        if( now.now ){
          trace( "BUG? invalid duplicate time freeze" );
          debugger;
          break;
        }
      }else{
        setTimeout( head.what, delay );
      }
      head.what = head.when = _;
    }
  }
  
  set_now_is_active = false;
  
}


/*
 *  Misc helper constants
 */

var ONE_YEAR   = exports.ONE_YEAR   = 365 * 24 * 60 * 60 * 1000;
var ONE_MONTH  = exports.ONE_MONTH  =  31 * 24 * 60 * 60 * 1000;
var ONE_WEEK   = exports.ONE_WEEK   =   7 * 24 * 60 * 60 * 1000;
var ONE_DAY    = exports.ONE_DAY    =       24 * 60 * 60 * 1000;
var ONE_HOUR   = exports.ONE_HOUR   =            60 * 60 * 1000;
var ONE_MINUTE = exports.ONE_MINUTE =                 60 * 1000;
var ONE_SECOND = exports.ONE_SECOND =                      1000;


/*
 *  Computation steps managements
 *
 *  Steps create or update entities 
 *  They can trigger consequences by pushing an entity into a fluid.
 *  If the same entity is pushed multiple times into the same fluid, only
 *  the first push is actually performed.
 */

var Stepping  = 0;
var StepQueue = [];
var PushQueue = [];
var PushMap   = {};

function steps( list ){
  De&&mand( !Stepping );
  Stepping++;
  //debugger;
  if( list ){
    list.forEach( function( item ){
      step( item );
    });
  }
  var queue  = StepQueue;
  StepQueue = [];
  var box = boxon();
  water.steps( queue ).boxon( function( err ){
    if( err ){
      // Get rid of potential new steps, cancelled
      StepQueue = [];
      Stepping--;
      if( err ){
        trace( "Cancel. Ephemeral step error:", err, err.stack );
      }
      box( err );
      return;
    }
    // If new steps where created, perform them now
    if( StepQueue.length ){
      steps().boxon( function( err ){
        Stepping--;
        if( err ){
          trace( "Ephemeral step error:", err, err.stack );
        }
        box( err ); } );
    }else{
      Stepping--;
      box();
    }
  } );
  return box;
}


function step( fn ){
  var s = function(){
    De&&mand( !StepQueue.length );
    try{
      fn();
    }catch( err ){
      trace( "Failed step", err, err.stack );
      throw err;
    }
    // Code was run, do pushes, at most one per fluid
    var queue = PushQueue;
    PushQueue = [];
    var map   = PushMap;
    PushMap = {};
    queue.forEach( function( f_e ){
      var fluid  = f_e.fluid;
      var entity = f_e.entity;
      var push_id = "" + fluid.water().id + "." + entity.id;
      // If such push is still pending, push and mark as 'done'
      if( map[ push_id ] !== "done" ){
        map[ push_id ] = "done";
        fluid.push( entity );
      }
    } );
  };
  StepQueue.push( s );
}


function push( f, e ){
// Add a push operation for an entity, done at end of current 'step'.
// During a step, multiple push operations are reduced to a single operation.
  var push_id = "" + f.water().id + "." + e.id;
  var state = PushMap[ push_id ];
  if( !state || state === "done" ){
    PushMap[ push_id ] = "pending"; // pending
    PushQueue.push( { fluid: f, entity: e } );
  }
  return e;
}


/*
 *  Voting machines.
 *
 *  There is a main voting machine and domain specific ones.
 *  Machines belongs to some "owner".
 *  Vote in domain specific machine is possible for persons who belong to
 *  that domain only. When the owner is a Twitter user, only followed users
 *  can vote.
 *  Note: each vote in a domain specific machine also impact the same topic
 *  in the main machine. That way, results for domain members can be compared
 *  with results from the general audience.
 *
 *  ToDo: factorize to make this application neutral.
 */

var MainMachine;

function Machine( options ){
  this.options = options;
  this.owner   = options.owner || "jhr";
  this.changes = [];
  this.state   = {
    NextId:      0,
    AllEntities: [],
    types:       []
  };
  this.state.AllEntities.machine = this;
  if( !MainMachine ){
    this.is_main = true;
    MainMachine = Machine.current = Machine.main = this;
  }else{
    this.is_main = false;
    var that = this;
    AllTypes.forEach( function( ctor ){
      var ctor_clone = {
        ctor:  ctor,
        all:   [],
        fluid: fluid()
      };
      that.state.types.push( ctor_clone );
    });
  }
  var label = this.is_main ? "" : this.owner;
  var id = label.toLowerCase();
  De&&mand( !Machine.by_id[ id ] );
  Machine.by_id[ id ] = this;
  this.label = label;
  this.id    = id;
  Machine.all.push( this );
}

Machine.by_id = {};
Machine.all   = [];

// Init the main machine
new Machine( {} );


Machine.find = function( label ){
  return Machine.by_id[ label.toLowerCase() ];
};


/*
 *  Ids - increasing integers
 *
 *  Ids are integers. When an entity needs one, NextId is provided and
 *  then incremented. NextId is adjusted to always be more than any previously
 *  used id (stored ones typically).
 */

// Global pool of all entities, id indexed
var NextId            = MainMachine.state.NextId;
var MaxSharedId       = 9999;
var AllEntities       = MainMachine.state.AllEntities;
var AllTypes          = [];
var AllTypesByName    = {};
var AllSharedEntities = AllEntities;


var lookup = function( id ){
// Look for an existing entity based on id, xor undefined.
// Also detect forward reference ids and adjust NextId accordingly.
  // Sometimes the UID is actually already an entity or a type
  if( !id ){
    trace( "BUG? lookup for a null id" );
    debugger;
    return;
  }
  if( id.is_entity )return id;
  if( id.prototype && id.prototype.is_entity )return id.prototype;
  if( typeof id === "string" ){
    // Sometimes the UID is actually an entity type name
    if( AllTypesByName[ id ] )return AllSharedEntities[ id ];
    return AllEntities[ id ];
  }
  if( id >= NextId ){ 
    de&&bug( "Forward UID lookup", id );
    NextId = id + 1;
  }
  var found;
  if( id > MaxSharedId ){
    De&&mand( AllEntities.machine === Machine.current );
    found = AllEntities[ id ];
    De&&mand( found.machine === AllEntities.machine );
  }else{
    found = AllSharedEntities[ id ];
  }
  if( found && found.is_update() ){
    trace( "BUG? found update instead of entity: " + found );
    debugger;
    return null;
  }
  return found;
};

var debug_entity;
exports.set_debug_entity = function( x ){
// Helper to start traces, before failing test cases typically
  debug_entity = x || NextId;
};


var alloc_id = function( x ){
// Entities have an unique id. This function checks if a provided id is
// a forward reference id and adjusts NextId accordingly. If no id is
// provided, one is returned and NextId is incremented.
  if( x ){
    if( x >= NextId ){
      de&&bug( "Forward UID", x );
      NextId = x + 1;
    }
    return x;
  }
  // de&&bug( "New UID", NextId );

  // debug_entity, when met, starts debug mode, useful for failing test cases
  if( NextId === debug_entity ){
    trace( "Start interactive debugging for entity " + NextId );
    de = true;
    debugging = true;
  }
  return NextId++;
};


/*
 *  Base class for all entities.
 *
 *  From latin "ens" + "itas", is being (real, physical).
 *   aka: a thing.
 *
 *  Entities have an ID, usually.
 *  There is a global table of all entities: AllEntities.
 *  Ephemeral entities will "expire", sometimes prematurely.
 *  Entities without an ID are "updates": they describe changes about
 *  properties of an existing entity; they are "values", not "objects".
 *
 *  Attributes:
 *    - id -- an integer, unique, increasing
 */

function Entity( options ){

  // Make sure the entity has an id
  this.id = alloc_id( options.id );

  // Track all entities, some of them will expire.
  // If .register() determines that this is an update, AllEntities is updated
  // to point to the actual entity, not to the update.
  De&&mand( AllEntities.machine === Machine.current );
  De&&mand( this.machine === Machine.current || !this.machine );
  AllEntities[ this.id ] = this;
}
exports.Entity = Entity;

// Define __proto__ for Entity instances
extend( Entity.prototype, {
  
  // To enable "duck" typing
  is_entity: true,
  
  // Redefined by sub types
  type: "Entity"

});


Entity.prototype.is_a = function( type ){
// Type checker
  return this.constructor === type;
};


Entity.prototype._identity = function( new_id ){
// Change the id, to be called in .inject() only, via .register()
  if( this.is_update() )return;
  var old_id = this.id;
  this.id = new_id;
  De&&mand( AllEntities.machine === Machine.current );
  De&&mand( this.machine === Machine.current );
  AllEntities[ new_id ] = this;
  // this.constructor.all[ new_id ] = this;
  // Free last allocated auto incr id if possible
  if( old_id === NextId - 1 ){
    AllEntities[ old_id ] = _;
    this.constructor.all[ old_id ] = _;
    NextId--;
  }
};


Entity.prototype.check_identity = function(){
  var valid = true;
  if( this.is_update() ){
    trace( "BUG, is an update, not an entity, id: " + this );
    valid = false;
  }
  var typed_entity = this.constructor.all[ this.id ]
  if( typed_entity !== this ){
    trace( "BUG, is not proper typed entity, id: " + this );
    valid = false;
  }
  var global_entity = AllEntities[ this.id ];
  if( global_entity !== this ){
    trace( "BUG, is not the proper global entity, id: " + this );
  }
  if( !valid ){
    trace( "BUG with type " + this.constructor.name );
    debugger;
  }
  return valid;
};


Entity.prototype.measure_name = function(){
  return "" + this.id;
};
Entity.prototype._measure_name_is_alpha = true;


Entity.prototype.inject = function( options ){
// Create a new entity or update an existing one (ie one with same "key")
  return new Entity( options );
};

  
Entity.prototype.expired = function(){
// Most entities "expires", usually after some delay. Some may "resurrect"
  return false;
};


Entity.prototype.is_update = function(){
// Some entities are actually updates about another entity. Pure values.
  return false;
};


Entity.prototype.is_create = function(){
  return !this.is_update();
};

  
Entity.prototype.push = function( a_fluid ){
  // Queue a push, done at end of current step
  return push( a_fluid, this );
};
  

Entity.prototype.log = function( f ){
// Debug related
  trace( f ? f.call( this, this ) : this.toString() );
};


Entity.prototype.toString = function(){
// .toString() displays the id and potential label
  return ""
  + (this === this.constructor.prototype ? "Proto" : "")
  + this.type
  + "." + this.id
  + ( this.buried ? "!buried" : "" )
  + ( this.label && ("" + this.label).toLowerCase() !== ("" + this.id).toLowerCase()
    ? "[" + this.label + "]"
    : ""
  );
};


// ToDo: is this OK?
Entity.prototype.constructor = Entity;


Entity.type = function( named_f ){
  return type( named_f, this );
};


// Pretty print for debugging
var abbreviations = {
  orientation: "o",      // short, because frequent
  vote:        "v",
  win:         "win",
  disagree:    "disa",
  against:     "again",
  total:       "tot",
  direct:      "dir",
  duration:    "dura",
  topic:       "&",
  tag:         "#",       // so called #hashtags
  timestamp:   "ts",
  proposition: "prop",
  persona:     "@",       // @name for users/personas
  "result":    "+",       // +results of votes on a proposition
  "time_touched": "touch"
};


function abbreviate( str ){
// Improve signal/noise in long traces using abbreviations
  var tmp = str;
  if( tmp.length <= 3 )return tmp;
  // Remove plural, ie remove ending 's'
  if( tmp[ tmp.length - 1 ] === "s" && tmp !== "ts" ){
    tmp = tmp.substring( 0, tmp.length - 1 );
  }
  // Either use an abbreviation or remove voyels
  return abbreviations[ tmp ]
  || tmp[0] + tmp.substring( 1 ).replace( /[aeiou]/g, "" );
}


function pretty( v, level ){
// Similar to inspect() but customized for entities
  
  if( arguments.length < 2 ){ level = 1; }
  
  if( level < 0 )return ".";
  
  var buf = "";
  
  if( v === _ )return "_";
  
  if( typeof v === "function" || typeof v === "object" ){

    if( v === null )return "null";
    if( typeof v === "function" ){

      // Water, get current |value
      if( v._water ){
        buf += "|" + pretty( v._water.current, level && level - 1 );
        return buf;

      // ref() => &id
      }else if( v.rid ){
        if( v.entity ){
          buf += "&" + pretty( v.entity, level && level - 1 );
        }else{
          buf += "&" + v.rid;
        }

      // normal functions
      }else{
        if( v.name ){
          buf += "." + v.name + "()";
        }else{
          buf += "()";
        }
      }

    // Water errors!
    }else if( v.watered ){
      buf += "!" + pretty( v.error, level && level - 1) + "!";
      
    }else if( Array.isArray( v ) ){
      if( level === 0 || !v.length ){
        return "[]" + (v.length ? "." + v.length : "");
      }else{
        var abuf = [];
        v.forEach( function( v ){
          abuf.push( pretty( v, level - 1 ) );
        });
        return "[" + abuf.join( " " ) + "]";
      }

    // Objects, if entity => toString()
    }else{
      if( level <= 1 ){
        if( v.is_entity ){
          buf += v.toString(); 
        }else{
          if( level === 0 )return "{.}";
        }
      }
    }

    if( level <= 0 )return buf;

    // Display attributes of object
    var lbuf = [];
    var val;
    for( var attr in v ){
      if( attr !== "id" && v.hasOwnProperty( attr ) ){
        val = v[ attr ];
        // Skip label, if already displayed
        if( v.is_entity && attr === "label" )continue;
        // Skip "buried" unless actually buried
        if( attr === "buried" ){
          if( val ){ lbuf.push( "buried" ) }
          continue;
        // Show "timestamp" & "time_touched" relative to now vs since epoch
        }else if( attr === "timestamp" || attr === "time_touched" ){
          val -= now();
        // Skip "effect" when there is none
        }else if( attr === "effect" ){
          if( val === _ )continue;
          // Skip "next_effect" when there is none
        }else if( attr === "next_effect" ){
          if( !val )continue;
        // Skip "updates" when only the initial create update is there
        }else if( attr === "updates" ){
          if( val && val._water && val() && val().length === 1 )continue;
          if( Array.isArray( val ) && val.length === 1 )continue;
        // Skip "now" and "was" attributes, too much noise
        }else if( attr === "now" || attr === "was" )continue;
        // For booleans, show the flag name, with a ! prefix if false
        if( val === true || val === false ){
          lbuf.push( (val ? "" : "!") + abbreviate( attr ) );
          continue;
        }
        if( typeof val !== "function" ){ attr = abbreviate( attr ); }
        lbuf.push( "" + attr + "" + pretty( val, level && level - 1 ) );
      }
    }
    if( !lbuf.length )return buf;
    return buf + "{" + lbuf.join( " " ) + "}";
    
  }else if( typeof v === "string" ){
    return buf + '"' + v + '"';
    
  }else if( v === ONE_YEAR ){
    return "1year";
    
  }else if( v === true ){
    return "_t";
    
  }else if( v === false ){
    return "_f";
    
  }else{
    return buf + "" + v;
  }
}
exports.pretty = pretty;


function dump_entity( x, level ){
  if( !level ){ level = 1; }
  trace( pretty( x, level ) );
  //console.log( "Value", x.value() );
}
exports.dump_entity = dump_entity;


function dump_entities( from, level ){
// This is a debugging tool at the moment.
// ToDo: implement a "dump_to_file()" that basically store a snapshot of the
// entire "image" of all entities.
// It should then be easy to later restore memory image of the entities and
// from that starting point handle the additional change log to fully restore
// any state.
// This is probably the simple way to compress a change log.
//   image + change log => new image.
// Nota: the compression is not a size compression, it is a speed compression
// because rebuilding the image from a blank image + the full log of changes
// takes much longer than rebuilding it from a snapshot image + the log of
// additional changes. The size of the image will shrink only when some
// entities expires. Consequently, an image can get quite large, which is
// an issue when memory is limited.
// Nota: storing an image let external programs perform analysis on that image
// to extract relevant information without having to duplicate the full
// update logic implemented by the image producer.
// Nota: for large image, the dump could block the machine for too long. In
// such cases, some incremental dump could be implemented, probably using some
// copy on change logic during the dump to avoid inconsistencies.
// Nota: if the image can be compressed to a reasonable size, it could be
// sent to subscribers, together with further changes, so that such subscribers
// could run the update logic locally and maintain a synchronized copy of the
// original image.
// Nota: an incremental sharing of the image is possible if changes done on the
// copy fail when they miss parts of the image, ask for these parts, and then
// replay that change, until it succeeds. This works like virtual memory, where
// accesses may generate "page faults" when data must be restored from swap.
// Nota: this master/slaves scheme can scale somehow but the "master" image
// is still a bottleneck. Specially considering the fact that any slave
// initiated update must be sent to the master in order to receive the changes
// to apply on the local copy (potentially partial) of the image.
// Nota: the slave could maintain a "shadow" copy of the image, in parallel to
// the true synchronized image, in order to provide quick feedback to whoever
// initiated the update ; there is a risk that such a shadow image never gets
// discarded by the true image, if connection with the master gets lost
// for too long for example. The issue is even more complex if sub slaves
// are informed about that shadow image. But it is feasible!
  trace( "--- ENTITY DUMP ---" );
  if( !level ){ level = 1; }
  var list = AllSharedEntities;
  var ii = from || 0;
  var item;
  if( ii <= MaxSharedId ){
    while( item = list[ ii++ ] ){
      dump_entity( item, level );
    }
    ii = MaxSharedId + 1;
  }
  list = AllEntities;
  De&&mand( AllEntities.machine === Machine.current );
  while( ii < NextId ){
    item = list[ ii++ ];
    item && dump_entity( item, level );
  }
  //console.log( "RootTopic:", value( RootTopic, true ) );
  trace( "--- END DUMP ---" );
}
exports.dump_entities = dump_entities;


/*
 *  Monkey patch Internet explorer to support Function.name
 *  Note: this does not work with ie8
 *  ToDo: fix this?
 */

if( Function.prototype.name === undefined ){
  console.log( "Monkey patch for Function::name" );
  Object.defineProperty( Function.prototype, 'name', {
    get: function(){
      var funcNameRegex = /function\s([^(]{1,})\(/;
      var results = (funcNameRegex).exec( (this).toString() );
      return ( results && results.length > 1 ) ? results[1].trim() : "";
    },
    set: function( value ){}
  });
}


/*
 *  Types for ephemeral entities.
 *
 *  Usage:
 *     base_type.type( sub_type );
 *     function sub_type( options ){
 *        ... called by sub_type.inject( options ) ...
 *        return this; // or something else, like constructors
 *     }
 *     sub_type.prototype.instance_method_xx = function( xxx ){ xxx };
 */

var type = function( ctor, base, opt_name ){
// Prototypal style inheritance with typed entities.
// "ctor" is a function. It's name is the subtype name.
// It is called in two cases:
// - To initialize a newly created entity
// - To update an existing entity
// It must call this.register( key ) to distinguish these cases.
//  'key' can be any string, including a combination of ids, "." separated.
// After that call, this.is_update() is false for creations.
//   this.water() returns l8 water() for entities xor almost idem() for updates
// Note: classes are "closed", it is not possible to add a method to a base
// class and expect it to be visible from it's subclasses ; this is so because
// methods are copied when the class is created (versus referenced). This
// is an optimization that speeds up method lookup a little.
  if( !base ){ base = Ephemeral; }
  var base_proto = base.prototype;
  AllTypes.push( ctor );
  De&&mand( base_proto.constructor === base );
  var name = opt_name || ctor.name;
  De&&mand( name, "Missing name for new ephemeral type" );
  AllTypesByName[ name ] = ctor;
  // Copy base class's prototype to init the new class prototype, for speed
  var sub_proto = ctor.prototype = extend( {}, base_proto );
  sub_proto.type = name;
  sub_proto.constructor = ctor;
  sub_proto.super  = base_proto;  // Access to super instance stuff, like instance methods
  ctor.super = base;   // Access to super static stuff, like class methods
  ctor.ctors = [];     // All constructors, from Entity, down to this new type
  var a_ctor = ctor;
  while( a_ctor ){
    ctor.ctors.unshift( a_ctor );
    a_ctor = a_ctor.super;
  }
  ctor.fluid = fluid();
  sub_proto.push = function( f ){
    if( f ){
      De&&mand( !f.is_update() );
      push( f, this );
      return this;
    }
    De&&mand( !this.is_update() );
    push( ctor.fluid, this );
    var sup = base.prototype.push;
    // ToDo: fix stack overflow
    if( 0 && sup ){
      sup.call( this );
    }
    return this;
  };
  // Build the instance creation/update function
  ctor.inject = sub_proto.inject = function( options ){
    var obj = Entity.current = Object.create( sub_proto );
    var obj0 = obj;
    De&&mand( Machine.current );
    obj.machine = Machine.current;
     // Call all constructors, including super, super's super, etc
    var ii = 1;
    var list = ctor.ctors;
    var a_ctor;
    var r;
    // ToDo: unroll for speed
    Entity.call( obj, options );
    while( a_ctor = list[ ii++ ] ){
      ctor.current =
      r = a_ctor.call( obj, options );
      if( typeof r !== 'undefined' ){
        obj = r;
        // Detect 'created expired' entities, during 'restore' typically
        if( !obj || obj.buried )return null;
      }
      // Don't build expired objects, during restore typically
      if( obj.buried )return null;
    }
    //de&&bug( "New entity", "" + pretty( obj, 2 ) );
    // Push new entity on the fluid bound to the entity's type, unless proto
    if( proto_entity ){
      if( obj === obj0 ){
        ctor.count++;
        obj.push();
      }
    }
    return obj;
  };
  // ToDo: improve create/update syntax
  sub_proto.update = function( options ){
    options.key = this.key;
    return this.inject( options );
  };
  // Create the prototypal instance. It will will create new instances
  var proto_entity = Object.create( sub_proto );
  // Copy properties, to speed up lookup
  extend( proto_entity, sub_proto );
  Entity.call( proto_entity, { machine: MainMachine } );
  // ctor.inject( { machine: MainMachine } );
  De&&mand( AllEntities.machine === Machine.current );
  ctor.prototype = sub_proto = AllEntities[ name ] = proto_entity;
  ctor.id = proto_entity.id;
  exports[ name ] = ctor;
  de&&bug( "Create entity " + pretty( proto_entity ) );
  // Create global table of all entities of this new type
  ctor.all   = Object.create( null );
  ctor.count = 0;
  ctor.basic_find = function( key ){
    var entity = ctor.all[ key ];
    if( entity !== AllEntities[ key ] ){
      trace( "BUG? mismatch with entities tables, id: " + key );
      trace( "Entity " + entity );
      debugger;
    }
    if( entity && !entity.buried )return entity;
    return _;
  };
  ctor.find = function( key ){
    var entity = ctor.all[ key ];
    if( entity ){
      entity.check_identity();
    }
    return entity;
  }
  // Ease sub typing
  ctor.type = function( sub_type, opt_name ){
    return type( sub_type, ctor, opt_name );
  };
  // Ease entity null/expired/bad-type detection
  ctor.valid = function( candidate ){
    if( !candidate )return false;
    if( typeof candidate !== "object" )return null;
    if( !candidate.machine )return null;
    if( candidate.machine !== Machine.current ){
      trace( "BUG, access to object from another machine"
      + ", key: " + candidate.key
      + ", machine: " + candidate.machine.id
      + ", current machine: " + Machine.current.id
      );
      debugger;
      return null;
    }
    if( typeof candidate.expired !== "function" )return null;
    if( candidate.expired() )return null;
    if( candidate.type !== this.name )return null;
    if( candidate.key && ( ctor.find( candidate.key ) !== candidate ) ){
      var found = ctor.find( candidate.key );
      if( !found ){
        trace( "BUG? candidate not found in instance table: " + candidate );
        return null;
      }
      trace( "BUG? duplicate object " + candidate
      + ", key: " + candidate.key
      + ", found: " + found
      );
      if( candidate.machine !== found.machine ){
        trace( "From differente machine"
        + ", candidate machine: " + candidate.machine.label
        + ", found machine: " + found.machine.label
        );
      }
      for( var attr in found ){
        if( candidate[ attr ] !== found[ attr ] ){
          trace( "Difference on", attr,
            "c: " + pretty( candidate[ attr ] ), ", f: " + pretty( found[ attr ] )
          );
        }
      }
      debugger;
      return found;
    }
    return candidate;
  };
  De&&mand( proto_entity === proto_entity.constructor.prototype );
  De&&mand( proto_entity.is_entity );
  De&&mand( typeof proto_entity.id !== "undefined" );
  De&&mand( proto_entity.constructor === ctor );
  De&&mand( proto_entity.constructor.prototype === proto_entity );
  De&&mand( proto_entity.inject !== base_proto.inject );
  return proto_entity;
};


/*
 *  Machine context switching
 */
 
function save_type_states(){
  var list = [];
  var len = AllTypes.length;
  var ctor;
  var state;
  for( var ii = 0 ; ii < len ; ii++ ){
    ctor = AllTypes[ ii ];
    state = {
      ctor:  ctor,
      all:   ctor.all,
      fluid: ctor.fluid,
    };
    list.push( state );
  }
  return list;
}

function restore_type_states( list ){
  var len = list.length;
  var state;
  var ctor;
  for( var ii = 0 ; ii < len ; ii++ ){
    state = list[ ii ];
    ctor = state.ctor;
    ctor.all   = state.all;
    ctor.fluid = state.fluid;
  }
}

function save_state(){
  var state = Machine.current.state;
  state.NextId      = NextId;
  De&&mand( AllEntities.machine === Machine.current );
  state.AllEntities = AllEntities;
  state.types       = save_type_states();
}


function restore_state( next_machine ){
  Machine.current = next_machine;
  var state = next_machine.state;
  NextId      = state.NextId;
  AllEntities = state.AllEntities;
  De&&mand( AllEntities.machine === Machine.current );
  restore_type_states( state.types );
}


Machine.activate = function( next_machine ){
  if( !next_machine ){
    next_machine = MainMachine;
  }
  return next_machine.activate();
};


Machine.prototype.toString = function(){
  return "<Machine " + this.owner + ">";
};


Machine.prototype.activate = function(){
  if( Machine.current === this )return this;
  save_state();
  restore_state( this );
  trace( "Machine activated:", this.label );
  return this;
};


/*
 *  helpers for .inject() definitions
 */
 
Function.prototype.water = function(){
// Ember style computed property.
// Usage, during entity's .inject() only:
//  this.attr = function(){ this.other_attr() * 10 }.water( this.other_attr );
// When .inject() is called, Entity.current points to the being injected obj
  var w = water();
  // Bind the water obj with the transform function and with the target entity
  w.entity = Entity.current;
  w.entity_transform = this;
  w( _, function_watered, arguments );
  return w;
};


Function.prototype.plasma = Function.prototype.when = function(){
// Ember style computed property.
// Usage, during entity's .inject() only:
//  this.attr = function(){ this.other_attr() * 10 }.water( this.other_attr );
// When .inject() is called, Entity.current points to the being injected obj
  var w = plasma();
  // Bind the water obj with the transform function and with the target entity
  w.entity = Entity.current;
  w.entity_transform = this;
  w( _, function_watered, arguments );
  return w;
};


// Ember's style, ie .when()
Function.prototype.when = Function.prototype.plasma;


function function_watered(){
  var entity    = Water.current.entity;
  var transform = Water.current.entity_transform;
  var r;
  try{
    r = transform.apply( entity, arguments );
  }catch( err ){
    trace( "Water transform error", err, "on entity " + entity, err.stack );
    de&&bugger();
  }
  return r;
}


/*
 *  Entities sometimes reference each others using ids, when stored typically
 */

function ref(){
  var f = function(){
    De&&mand( f.machine === Machine.current );
    // Set
    if( arguments.length ){
      var entity = arguments[0];
      // r( some_entity )
      if( typeof entity === "object" ){
        f.entity = entity;
        f.rid   = entity.id;
      // r( some_id )
      }else{
        f.entity = null;
        f.rid   = alloc_id( entity ) || 0;
      }
      return f;
    }
    // Get
    if( f.entity ){
      return f.entity.valid();
    }
    De&&mand( AllEntities.machine === Machine.current );
    f.entity = AllEntities[ f.rid ];
    De&&mand( !f.entity || f.entity.machine === Machine.current );
    if( f.entity && !f.entity.valid() ){
      f.entity = null;
    }
  };
  f.machine = Machine.current;
  if( arguments.length ){
    f.apply( null, arguments );
  }else{
    f.entity = null;
    f.rid   = 0;
  }
  return f;
}


function deref( o, seen ){
// Resolve id references into pointers
  if( !o )return o;
  if( typeof o === "function" ){
    // o can be a type sometimes, it is the prototype that is an entity
    if( o.prototype.is_entity ){
      o = o.prototype;
    }else{
      if( o.rid ){
        o = o();
      }
      return o;
    }
  }
  if( typeof o !== "object" )return o;
  if( !seen ){
    seen = {};
  }else{
    if( o.is_entity ){
      if( seen[ o.id ] )return o;
      seen[ o.id ] = true;
    }
  }
  for( var attr in o ){
    if( o.hasOwnProperty( attr ) ){
      if( attr === "machine" ){
        o.machine = Machine.current;
      }else if( attr[0] !== "_" ){
        o[ attr ] = deref( o[ attr ], seen );
      }
    }
  }
  return o;
}


/*
 *  json encoding of entity requires changing pointers into references.
 *  if o.attr points to an entity, it is replaced by an o.$attr with an id.
 *  In arrays, pointers are replaced by { $: id } values.
 */

var cached_rattr_encode = {};
var cached_rattr_decode = {};


function rattr_encode( attr ){
  var v;
  if( v = cached_rattr_encode[ attr ] )return v;
  v = "$" + attr;
  cached_rattr_encode[ attr ] = v;
  cached_rattr_decode[ v    ] = attr;
  return v;
}


function rattr_decode( attr ){
  var v;
  if( v = cached_rattr_decode[ attr ] )return v;
  v = attr.substring( 1 );
  cached_rattr_encode[ v    ] = attr;
  cached_rattr_decode[ attr ] = v;
  return v;  
}


function json_encode( o ){
// Change pointers into id references for json storage
  if( typeof o !== "object" )return o;
  var json;
  if( Array.isArray( o ) ){
    json = [];
    o.forEach( function( v, ii ){
      if( v ){
        if( v.id ){
          json[ ii ] = { $: v.id };
        }else if( v.rid ){
          json[ ii ] = { $: v.rid };
        }else{
          json[ ii ] = json_encode( v );
        }
      }else{
        json[ ii ] = v;
      }
    });
    return json;
  }
  json = {};
  for( var attr in o ){
    if( o.hasOwnProperty( attr ) ){
      if( attr === "machine" )continue;
      if( o[ attr ] ){
        if( o[ attr ].is_entity ){
          json[ rattr_encode( attr ) ] = o[ attr ].id;
        }else if( o[ attr ].rid ){
          json[ rattr_encode( attr ) ] = o[ attr ].rid;
        }else{
          json[ attr ] = json_encode( o[ attr ] );
        }
      }else{
        json[ attr ] = o[ attr ];
      }
    }
  }
  return json;
}


function json_decode_resolve( id ){
  alloc_id( id );
  var entity = lookup( id );
  if( entity ){
    if( !entity.is_entity ){
      trace( "BUG? lookup() for " + id + " is not an entity" );
      debugger;
      throw( new Error( "Invalid json encoded entity" ) );
    }
    var valid = entity.valid();
    if( entity !== valid ){
      trace( "Reference to invalid entity " + entity
      + " vs " + ( entity.valid() )
      + ", buried: " + entity.buried
      );
      if( !entity.buried )debugger;
    }
    return valid;
  }else{
    trace( "BUG? reference to unknown entity: " + id );
    // debugger;
    throw(
      new Error( "Invalid json encoded entity, bad reference, id: " + id)
    );
    // return null;
  }
}


function json_decode( o ){
  if( typeof o !== "object" )return o;
  var decoded;
  if( Array.isArray( o ) ){
    decoded = [];
    o.forEach( function( v, ii ){
      if( v && v.$ ){
        decoded[ ii ] = json_decode_resolve( v.$ );
      }else{
        decoded[ ii ] = v;
      }
    });
    return decoded;
  }
  decoded = {};
  for( var attr in o ){
    if( o.hasOwnProperty( attr ) ){
      if( attr === "debug" ){
        debug_mode( de = o[ attr ] );
        debugger;
      }
      if( attr[0] === "$" ){
        decoded[ rattr_decode( attr ) ] = json_decode_resolve( o[ attr ] );
      }else{
        decoded[ attr ] = json_decode( o[ attr ] );
      }
    }
  }
  return decoded;
}


var value_dont_copy = {
  "__proto__": true,
  machine: true,
  type : true,
  v: true,
  super: true,
  is_entity: true,
  entity: true,
  buried: true,
  was: true,
  now: true,
  updates: true,
  next_effect: true,
  last_effect: true,
  effect: true,
  change: true,
  snapshot: true
};


function value( x, force ){
// Entity's value is a snapshot of the entity's current state
  // console.log( x );
  var o;
  var a;
  var r;
  if( x ){
    if( x.snaptime ){
      de&&bug( "Copying a value?" );
      de&&bugger();
      return x;
    }
    if( x.is_entity && x.buried ){
      return _;
    }else if( x.is_entity && !force ){
      return x.id;
    }else if( typeof x === "function" ){
      if( x._water ){
        return value( x._water.current );
      }
    }else if( typeof x === "object" ){
      if( x.watered ){
        return { watered: "water", error: value( x.error ) };
      }else if( Array.isArray( x ) ){
        a = [];
        x.forEach( function( v, ii ){
          a[ ii ] = value( v );
        });
        return a;
      }else{
        o = {};
        // Scan all properties, including inherited ones
        for( var attr in x ){
          r = x[ attr ];
          if( typeof r !== "undefined"
          // Filter out some attributes, include _ prefixed ones
          &&  !value_dont_copy[ attr ]
          &&  attr[0] !== "_"
          ){
            r = value( r  );
            if( typeof r !== "undefined" ){
              if( de && !force ){
                // bug( "Copied attr " + attr );
              }
              o[ attr ] = r;
            }
          }
        }
        return o;
      }
    }else{
      return x;
    }
  }else{
    return x;
  }
}
exports.value = value;


Entity.prototype.value = function(){
// The "value" of an entity is a snapshot copy of the current value of all
// it's attributes. Some attributes are actually skipped because they relate
// to the internal mechanic of the change processing.
  //De&&mand( Machine.current = this.machine );
  return value( this, true );
};


Entity.prototype.json_value = function(){
// JSON compatible value. Reference to other entities are encoded into $xxx.
  return json_encode( this.value() );
};


/*
 *  The only constant is change - Heraclitus
 *
 *  Changes are TOPs: Target.Operation( Parameter ). They describe an event/
 *  action about something. Usually it's about creating or updating an entity.
 *
 *  Changes are the only inputs of the Ephemeral machine.
 *
 *  The processing of change produces one or more effects. The first effect
 *  is linked with the changed entity and linked with further effects from
 *  there. An effect, see Effect entity base type below, is an entity, either
 *  a new one or an updated one.
 *
 *  Attributes:
 *  - Entity/id
 *  - ts          -- timestamp
 *  - t           -- target type
 *  - o           -- operation, ie "inject" typically, it's a create/update
 *  - p           -- parameters, sent to the type.inject() function
 *  - from        -- optional link to some previous change
 *  - to          -- the first entity that was impacted by the change
 *  - last_effect -- the last entity that was impacted by the change
 *  - change      -- optional, when change is somehow an effect itself
 */

if( !Change.name ){
  console.log( "Weird javascript bug where function's name is not defined" );
}
Entity.type( Change );
function Change( options ){
  this.ts   = options.timestamp || now();
  this.t    = options.t;
  this.o    = options.o || "inject";
  this.p    = options.p || {};
  this.from = options.from;
  this.to   = options.to;
  this.last_effect = _; // Tail of linked effect, see .next_effect
  this.change = _;      // When change is somehow an effect itself
}


Change.process = function( change, done_cb, progress_cb ){
// Process a json_encode() encoded change, like those in log files
  if( !change )return;
  function async_change( async, array, index, max, done_cb, progress_cb ){
    if( progress_cb && index === 0 ){
      progress_cb( index, false );
    }
    // Process some changes, wait some delay and keep going on until the end
    var slice_size = 50;
    var delay = 5; // ms
    var max_range = index + slice_size;
    if( max_range > max ){
      max_range = max;
    }
    for( var ii = index ; ii <= max_range ; ii++ ){
      Change.process( array[ ii ] );
    }
    if( max_range === max ){
      progress_cb && progress_cb( max_range, true );
      done_cb && done_cb(); 
    }else{
      progress_cb && progress_cb( max_range, false );
      // Keep going, starting at next change, after a 10ms delay
      setTimeout( function(){
        async( function(){
          async_change(
            async,
            array,
            max_range + 1,
            max,
            done_cb,
            progress_cb
          );
        });
      }, delay );
    }
  }
  var is_array = Array.isArray( change );
  if( (done_cb || progress_cb ) && !is_array ){
    change = [ change ];
    is_array = true;
  }
  if( is_array ){
    var async = ( done_cb || progress_cb ) && l8 && l8.tick;
    var array = change;
    var len   = array.length;
    if( async ){
      async( async_change.bind(
        null,
        async,
        array,
        0,
        len - 1,
        done_cb,
        progress_cb
      ) );
    }else{
      for( var ii = 0 ; ii < len ; ii++ ){
        Change.process( array[ ii ] );
      }
    }
    return;
  }
  var current_change;
  try{
    current_change = json_decode( change );
  }catch( err ){
    trace( "Change json_decode() error", err, err.stack );
    debugger;
    throw new Error( "EphemeralChangeJsonError" );
  }
  var r;
  try{
    r = Change.prototype.process.call( current_change );
  }catch( err ){
    trace( "Change process error", err, err.stack );
    trace( "Change:", pretty( current_change ) );
    debugger;
    throw err;
  }
  return r;
};


Change.prototype.process = function(){
// This is the mapping function applied on the fluid of Changes
  var target = lookup( this.t );
  De&&mand( target );
  var operation = this.o || "inject";
  de&&bug( "\nChange.process, invoke", operation, "on " + target, "p:", value( this.p ) );
  try{
    // If not id was provided for the new entity, reuse the change's id itself
    if( this.p && !this.p.id && this.id ){
      // This is useful to avoid id excessive expansion during restarts
      this.p.id = this.id;
    }
    // Remember what is the change currently processed, see Effect constructor
    Change.current = this;
    // Freeze time until next change
    set_now( this.p.ts );
    return target[ operation ].call( target, this.p );
  }catch( err ){
    trace( "Could not process change", value( this, true ), err, err.stack );
    return water.fail( err );
  }
};


/*
 *  Effect entity, abstract type
 *  aka Mutable
 *
 *  Changes produce effects. Let's track the updates.
 *  All effects come from some Change, the last change involved is remembered
 *  and other effects due to that same last change are linked together. This
 *  is mainly for auditing/debugging but it might be useful for other
 *  purposes.
 *
 *  Attributes:
 *  - Entity/id   -- an integer, unique, increasing
 *  - key         -- a unique key, a string
 *  - change      -- the change that triggered the effect
 *  - next_effect -- next effect in change's list of effects (see Change/to)
 *  - effect      -- optional, the updated entity, if effect is an update
 *  If the effect is not an update, then it is the updated entity:
 *  - updates     -- array of snapshot values of the entity, ie log
 *  - was         -- the last snapshot value of the entity
 */

Entity.type( Effect );
function Effect( options ){

  var change = Change.current;

  // Effect is usually due to a change, link change to effects, linked list
  this.change = change;

  if( change ){
    
    // If first effect
    if( !change.to ){
      change.to = this;
      change.last_effect = this;
  
    // Else effect is an indirect effect of the initial change, link them
    }else{
      De&&mand( change.last_effect );
      change.last_effect.next_effect = this;
      change.last_effect = this;
      this.next_effect = _;
    }
    
  }

  // Also remember this change as the "first" update, ie the "create" update
  this.updates = change ? [ change.p ] : [];
  this.was     = _;

  // Some effects are about a pre existing entity, ie they are updates.
  // .register( key ) will detect such cases
  // ToDo: unify key & id, they are now the same
  this.key    = options.key;
  this.effect = _;
  this.next_effect = _;
}

Effect.prototype.measure_updates = function(){
  return this.updates.length;
};


Effect.prototype.update = function( other ){
// Default update() injects other's attributes into entity.
  De&&mand( other.is_update() );
  for( var attr in other ){
    if( !other.hasOwnProperty( attr ) )continue;
    // Skip inherited attributes
    if( attr in Effect.prototype )continue;
    // If target attribute is a function, call it, ie update water sources
    if( typeof this[ attr ] === "function" && this[ attr ]._water ){
      // Updates are values, no water in them
      De&&mand( typeof other[ attr ] !== "function" );
      this[ attr ]( other[ attr ] );
      continue;
    }
    // Skip attributes that don't already exists
    if( !this.hasOwnProperty( attr ) )continue;
    this[ attr ] = other[ attr ];
  }
  return this;
};


Effect.prototype.outlive = function( other, force ){
// Make sure this entity won't get buried before some other one
  if( !other ){
    trace( "BUG? attempt to outlive null by " + this );
    debugger;
    return this;
  }
  if( this.buried ){
    trace( "BUG? buried entity cannot outlive, " + this + ", other: " + other );
    debugger;
    return this;
  }
  if( other.expired() ){
    trace( "BUG? attempt to outlive expired " + other + ", by " + this );
    debugger;
    return this;
  }
  if( this.expired() && !force ){
    trace( "BUG? late call to outlive() by " + this, ", other: " + other );
    debugger;
  }
  var delta = this.expire() - other.expire();
  // OK if it will expire after the other one
  if( delta >= 0 )return this;
  // This entity needs to survive longer
  delta = -delta;
  if( delta < ONE_HOUR ){
    delta = ONE_HOUR;
  }
  var new_duration = this.duration + delta;
  this.set_duration( new_duration );
  return this;
};


Effect.prototype.touch = function(){
// Called by .register(), when there is an update.
// To be redefined by sub types
  return this;
};


Effect.prototype.expiration = function(){
  // ToDo: cascade expiration, should bury dependant effects somehow
  //Effec.super.prototype.expiration.call( this );
};


Effect.prototype._register = function( key ){
// Register entity and detect updates about pre-existing entities.
// Returns null for 'created expired' entity, during 'restore' typically.
  //if( this.id === 10009 )debugger;
  if( typeof key !== "string" ){
    De&&mand( AllEntities.machine === Machine.current );
    var tmp = AllEntities[ key ];
    if( !tmp ){
      trace( "BUG? .register( " + key + ") with integer id of missing entitiy" );
      throw( new Error( "bad id, missing entity" ) );
    }
    tmp = tmp.key;
    if( !tmp ){
      trace( "BUG? .register( " + key + ") with integer id of invalid entitiy"
      + tmp );
      throw( new Error( "bad id, missing key" ) );
    }
    key = tmp;
  }
  // Look for an existing entity with same type and same key (global scope)
  this.key = key;
  var entity = this.constructor.all[ key ];
  // If found then this entity is actually an update for that existing entity
  if( entity ){
    de&&bug( "Update on " + entity + ", key:" + key + ", update: " + this );
    if( !entity.expired ){
      trace( "BUG? Invalid entity for key: " + key );
      debugger;
      throw( new Error( "Invalid entity, corrupted table" ) );
    }
    De&&mand( entity !== this );
    De&&mand( !entity.is_update() );
    De&&mand( AllEntities.machine === Machine.current );
    De&&mand( entity.machine === Machine.current );
    AllEntities[ key ] = entity;
    if( !entity.expired ){
      trace( "BUG? Invalid entity!" );
      debugger;
      return null;
    }
    if( entity.expired() ){
      if( entity.buried ){
        trace( "BUG? Attempt to update a buried entity" );
        debugger;
        return null;
      }
      trace( "BUG? Attempt to update an expired entity: " + entity );
      trace( "not buried. timestamp: " + entity.timestamp
      + ", duration: " + entity.duration
      + ", since " + ( now() - entity.timestamp - entity.duration ) + " ms"
      );
      // Entity not buried, extend it's duration for a while and proceed
      entity.outlive( this, true /* force */ );
      //debugger;
    }
    // Remember the target entity that this update produces an effect on
    this.effect = entity;
    //this.to = entity;
    De&&mand( this.is_update() );
    De&&mand( !entity.is_update() );
    // Add the update to the entity's log of updates
    var updates = entity.updates;
    entity.was = entity.value();
    updates.push( entity.was );
    entity.updates = updates;
    // Invoke possibly redefined .touch()
    entity.touch();
    return entity;
  }
  // Check expiration, ie born expired entities
  if( now() > this.timestap + this.duration ){
    this.buried = true;
    return null;
  }
  // Genuine new entity, key first seen, track it
  de&&bug( "Key for new " + this + " is: " + key );
  this.constructor.all[ key ] = this;
  // Schedule future expiration
  this.schedule( this.expire() );
  return this;
};

Effect.prototype.register = function( key ){
  if( this.expired() ){
    trace( "BUG? Attempt to register an expired entity/update: " + this
    + ", key:" + key );
    if( !this.buried ){
      trace( "not buried. timestamp: " + this.timestamp
      + ", duration: " + this.duration
      + ", since " + ( now() - this.timestamp - this.duration ) + " ms"
      );
    }
    debugger;
    return null;
  }
  this._identity( key );
  return this._register( key );
};

Effect.prototype.is_update = function(){ return !!this.effect; };

  
Effect.prototype.water = function( other ){
// Changes to entities involves watering the original with an update.
  // There must be actual water only in the original, not in the updates
  return other === this
  ? water
  : function water_update( init_val ){
    // x = water( init_val );
    if( typeof init_val !== "undefined" )return init_val;
    // x = water( _, ff, [ init_val, other_deps... ] )
    return arguments[2] && arguments[2][0];
  };
};


Effect.prototype.plasma = function( other ){
// Changes to entities involves watering the original with an update.
  // There must be actual water only in the original, not in the updates
  return other === this
  ? plasma
  : function plasma_update( init_val ){
    // x = water( init_val );
    if( typeof init_val !== "undefined" )return init_val;
    // x = water( _, ff, [ init_val, other_deps... ] )
    return arguments[2] && arguments[2][0];
  };
};


/*
 *  Immutable entities are one shot effects, no updates
 */

Effect.type( Immutable );
function Immutable(){};

Immutable.prototype.register = function(){
  var target = Effect.prototype.register.apply( this, arguments );
  De&&mand( target === this );
  return target;
};


/*
 *  Version entity
 *
 *  Persisted entity are stored in "log" files. Whenever a new version of this
 *  software is created, with changes to the data schema, a new version entity
 *  is created.
 *  During restore (from log) global Change.versioning progresses until it
 *  reaches the value of Change.version, the current version of the schema.
 *  As a result, code can check Change.versioning to adapt the schema of older
 *  changes.
 */

Change.version    = "1";
Change.versioning = "";

Entity.type( Version );
function Version( options ){
  this.label = Change.version = options.label;
}


/*
 *  The rest is ephemeral. It will expire and be buried, unless resurrected.
 *  Abstract type.
 *
 *  Lifecycle: create(), [renew()], expiration(), [resurrect() + renew()]...
 *
 *  Attributes:
 *  - Entity/id
 *  - Effect/key
 *  - Effect/updates
 *  - Effect/was
 *  - timestamp    -- time at creation
 *  - time_touched -- time when last touched/updated
 *  - duration     -- life expectancy
 *  - buried       -- flag, true after expiration without resurrection
 */

Effect.type( Ephemeral );
function Ephemeral( options ){
  this.timestamp    = options.timestamp || now();
  this.time_touched = options.time_touched || this.timestamp;
  this.duration     = options.duration || ONE_YEAR;
  this.buried       = false;
}


Ephemeral.each = function( source, functor, every ){
// Apply function on array. If array is a water source then update source
// array with buried entities removed. Return true iff water was updated.
  if( !source )return;
  var is_water = source._water;
  var entities = is_water ? is_water() : source;
  var ii;
  // If map, convert into array first
  if( !Array.isArray( entities ) ){
    var buf = [];
    for( var name in entities ){
      buf.push( entities[ name ] );
    }
    entities = buf;
  }
  var len = entities.length;
  if( !len )return every;
  var entity;
  var buried_found = false;
  var r;
  for( ii = 0 ; ii < len ; ii++ ){
    entity = entities[ ii ];
    if( !entity )continue;
    if( entity.buried && is_water ){
      buried_found = true;
    }else{
      if( !entity.expired ){
        trace( "BUG? invalid entity in array" );
        debugger;
        return true;
      }
      if( !entity.expired() ){
        r = functor.call( this, entity );
        if( every & !r )return false;
      }
    }
  }
  if( buried_found ){
    is_water( Ephemeral.compact( entities ) );
  }
  return true;
};


Ephemeral.every = function( source, functor ){
  return this.each( source, functor, true );
};


Ephemeral.max = function( source, functor ){
  var best;
  var best_val;
  Ephemeral.each( source, function( entity ){
    var val = functor.call( null, entity );
    if( typeof val === "undefined" )return;
    if( typeof best === "undefined" ){
      best = entity;
      best_val = val;
      return;
    }
    if( val > best_val ){
      best = entity;
      best_val = val;
    }
  });
  return best;
};


Ephemeral.compact = function( entities, force ){
// Return either same array or new array without buried entities
  var list = [];
  var ii;
  var len = entities.length;
  var entity;
  // Unless specified, check presence of at least one buried entity
  if( !force ){
    for( ii = 0 ; ii < len ; ii++ ){
      entity = entities[ ii ];
      if( entity.buried ){
        force = true;
        break;
      }
    } 
  }
  // If no buried entity, return same array
  if( !force )return entities;
  for( ii = 0 ; ii < len ; ii++ ){
    entity = entities[ ii ];
    if( entity.buried )continue;
    list.push( entity );
  }
  return list;
};


Ephemeral.prototype.expire = function(){
  return this.timestamp + this.duration;
};


Ephemeral.prototype.expired = function(){
  if( this.buried )return true;
  var flag = now() >= this.expire();
  return flag;
};


Ephemeral.prototype.half_life = function(){
// True if duration since creation is more than duration until expiration
  return now() > ( this.timestamp + this.duration / 2 );
};


Ephemeral.prototype.bury = function(){
  if( this.buried ){
    // Process case "init" where object get buried immediately during creation
    this.buried = true;
    return;
  }
  this.buried = "pre-expiration";
  if( !this.is_update() ){ this.expiration(); }
  var id = this.id;
  // Clear object if not resurrected, this enables some garbage collection
  if( this.buried ){
    this.check_identity();
    this.buried = true;
    for( var attr in this ){
      if( !this.hasOwnProperty( attr ) )continue;
      if( attr !== "is_entity" && attr !== "buried" ){
        var v = this[ attr ];
        if( v ){
          if( v._water ){ water.dispose( v ); }
        }
        this[ attr ] = _;
      }
    }
    if( !this.buried ){
      trace( "BUG? should be buried: " + id );
      debugger;
    }
    Ephemeral.count--;
    // Also remove from list of all entities to prevent new references to it
    De&&mand( AllEntities.machine === Machine.current );
    this.constructor.all[ id ] = _;
    AllEntities[ id ] = _;
  }
};


Ephemeral.prototype.expiration = function ephemeral_expiration(){
  // Default is to create an expiration entity but subtype can do differently
  Expiration.inject( { entity: this } );
  Ephemeral.super.prototype.expiration.call( this );
};


Ephemeral.prototype.resurrect = function(){
// To be called from a redefined .expiration(), needs a renew().
  if( !this.buried )throw new Error( "Resurrect Entity" );
  this.buried = false;
  // Resurrection.inject( { entity: this ); } );
};


Ephemeral.prototype.schedule = function( limit ){
// Schedule processing of then entity's burial when the entity will expire.
// This will call .bury(), now or later, depending on limit (a timestamp)
  var delay = limit - now();
  if( delay <= 0 ){
    delay = 0;
  }
  var id      = this.id;
  var machine = this.machine;
  freezableSetTimeout( function(){
    machine.activate();
    var that = AllEntities[ id ];
    // Already buried?
    if( !that || that.buried )return;
    if( that.expired() ){ that.bury(); }
  }, delay );
  return this;
};


Ephemeral.prototype.set_duration = function( duration ){
  if( !duration )return null;
  this.duration = duration;
  this.schedule( this.timestamp + duration );
  return this;
};


Ephemeral.prototype.age = function(){
  return now() - this.timestamp;
};


Ephemeral.prototype.measure_age = function(){ 
  return this.age();
};


Ephemeral.prototype.measure_duration = function(){
  return this.duration;
};


Ephemeral.prototype.measure_remaining_duration = function(){
  var limit = this.timestamp + this.duration;
  return now() - limit;
};


Ephemeral.prototype.life_expectancy
= Ephemeral.prototype.measure_remaining_duration;


Ephemeral.prototype.touch = function(){
  this.time_touched = now();
};


Ephemeral.prototype.age_touched = function(){
  return now() - this.time_touched;
};


Ephemeral.prototype.measure_age_modified = function(){
  return this.age_touched();
};


Ephemeral.prototype.renew = function( duration ){
  if( this.buried )return;
  if( !duration ){ duration = ONE_WEEK; }
  var new_limit = now() + duration;
  var total_duration = new_limit - this.timestamp;
  this.set_duration( total_duration );
  // Renewal.inject( { entity: this } );
};



/*
 *  Base type of event entities
 *
 *  Attributes:
 *  - Entity/id
 */

Immutable.type( Event );
function Event(){}


/*
 *  Expiration entity
 *  This is the event that occurs after an entity expires.
 *
 *  When this event occurs, the entity cannot be resurrected anymore and
 *  all information about is was erased and cannot be recovered.
 *  To resurrect an entity when it is about to expire, one needs to
 *  redefine the .expiration() method of that entity.
 *
 *  Attributes:
 *  - Entity/id
 *  - entity     -- the entity that expired, most attributes were cleared
 *  - entity_id  -- it's id
 *  - entity_key -- it's key, if any
 */
 
 Event.type( Expiration );
 function Expiration( options ){
   trace( "Expired & buried: " + options.entity );
   this.entity     = options.entity;
   this.entity_id  = this.entity.id;
   this.entity_key = this.entity.key;
   De&&mand( this.entity.buried );
 }


/*
 *  Trace entity
 *
 *  This is for deployed systems
 *
 *  Attributes:
 *  - Entity/id
 *  - severity   -- critical/error/warn/info/debug
 *  - parameters -- list of parameters
 *  - subject    -- the entity this trace is about, if any
 */
 
Event.type( Trace );
function Trace( options ){
  this.subject    = options.subject;
  this.severity   = options.severity;
  this.parameters = options.parameters;
}

// Trace event severity
Trace.debug    = "debug";
Trace.info     = "info";
Trace.warn     = "warn";
Trace.error    = "error";
Trace.critical = "critical";

function TRACE( e, p ){ 
  Trace.inject({ event: e, parameters: p });
}

function DEBUG(){    TRACE( Trace.debug,    arguments ); }
function INFO(){     TRACE( Trace.info,     arguments ); }
function WARN(){     TRACE( Trace.warn,     arguments ); }
function ERROR(){    TRACE( Trace.error,    arguments ); }
function CRITICAL(){ TRACE( Trace.critical, arguments ); }

exports.TRACE    = TRACE;
exports.DEBUG    = DEBUG;
exports.INFO     = INFO;
exports.WARN     = WARN;
exports.ERROR    = ERROR;
exports.CRITICAL = CRITICAL;


/*
 *  Measures & comparisons
 */

Ephemeral.measures = {
  sort: "heat",
  hot: "heat"
};


var compare_measures = function( a, b, criterias ){
  if( !a )debugger;
  if( !b )debugger;
  if( !criterias ){
    criterias = [ "-age" ];
  }
  if( !criterias.length )return 0;
  var criteria = criterias[0];
  var ascending = criteria[0] !== "-";
  if( !ascending ){
    criteria = criteria.substring( 1 );
  }else if( criteria[0] === "+" ){
    criteria = criteria.substring( 1 );
  }
  var meter = "measure_" + ( Ephemeral.measures[ criteria ] || criteria );
  var cmp = a[ meter ];
  if( !cmp ){
    trace( "BUG? cannot compare using " + criteria );
    return 0;
  }
  var va;
  var vb;
  if( arguments.length === 3 ){
    va = cmp.call( a );
    vb = cmp.call( b );
  }else{
    var param = Array.prototype.slice.call( arguments, 3 );
    va = cmp.apply( a, param );
    vb = cmp.apply( b, param );
  }
  var is_alpha = a[ "_" + meter + "_is_alpha" ];
  var r = 0;
  if( !is_alpha ){
    r = va - vb;
  }else{
    if( va > vb ){
      r = 1;
    }else if( va < vb ){
      r = -1;
    }else{
      r = 0;
    }
  }
  if( r === 0 ){
    if( criterias.length === 1 ){
      // If same, recently modified/create always come first
      if( a.time_touched ){
        return ascending
        ? a.time_touched - b.time_touched
        : b.time_touched - a.time_touched;
      }
      return ascending
      ? a.timestamp - b.timestamp
      : b.timestamp - a.timestamp;
    }
    criterias.shift();
    return compare_measures( a, b, criterias );
  }
  return ascending ? r : -r;
};

Ephemeral.compare_measures = compare_measures;


/*
 *  Persistent changes processor
 */

function persist( fn, a_fluid, filter ){
  
  // At some point changes will have to be stored
  var machine = Machine.current;
  var restore_done = false;
  
  a_fluid.tap( function( item ){
    // Don't store while restoring from store...
    if( !restore_done )return;
    // Some changes don't deserve to be stored
    if( filter && !filter( item ) )return;
    // Don't log traces slowly
    if( item.type === "Trace" ){
      // ToDo: write traces, fast
      return;
    }
    try{
      machine.activate();
      de&&bug( "Write", fn, "id:", item.id );
      // ToDo: let entity decide about is own storage format
      var value = json_encode( deref( item ) );
      var json;
      if( 0 ){
        if( item.store_value ){
          value = item.store_value();
        }else{
          value = Entity.store_value.call( item );
        }
      }
      // Special handling for "Change" entity
      // ToDo: should be in Change.prototype.store_value()
      if( value.o === "inject" ){
        // Remove default o:"inject" member from Change entities
        value.o = _;
        // Get rid of potentially duplicated id
        if( value.id === value.p.id ){
          value.id = _;
        }
        // Move timestamp into "options" parameter
        value.p.ts = value.ts;
        value.ts = _;
        // Remove .to if it points to the entity itself
        if( value.$to && value.p.$to === value.uid ){
          value.$to = _;
        }
        // Remove .last_effect and change, internal use only
        value.$last_effect = value.change = _;
        // As a result value.t is like an SQL table name
        // and value.p is like an SQL record
      }
      // Track max id so far, needed at restore time
      // value.lid = NextId - 1;
      json = JSON.stringify( value );
      Machine.current.changes.push( value );
      if( fn._water ){
        fn( value );
      }else{
        fs.appendFileSync( fn, json + "\r\n" );
      }
    }catch( err ){
      trace( "Could not write to", fn, "id:", item.id, "err:", err );
      trace( err );
    }
  });
  
  // Return a boxon, fulfilled when restore is done
  var next = boxon();
  
  var fs = require( "fs" );
  
  if( Ephemeral.force_bootstrap ){
    try{ fs.unlinkSync( fn ); }catch( _ ){}
    restore_done = true;
    next( "forced bootstrap" ); return next;
  }
  
  // Determine what should be the next UID, greater than anything stored
  // ToDo: avoid reading whole file!
  try{
    var content = fs.readFileSync( fn, "utf8" );
    var idx = content.lastIndexOf( '"id":' );
    if( idx !== -1 ){
      content = content.substring( idx + '"id":'.length );
      content = parseInt( content, 10 );
      de&&bug( "Restore, max id:", content );
      alloc_id( content );
    }
  }catch( err ){
    // File does not exist, nothing to restore
    restore_done = true;
    // Log version
    if( Change.version !== Change.versioning ){
      Change.versioning = null;
      step( function(){
        Change.inject({ t: "Version", o: "inject", p: { label: Change.version } });
      } );
    }
    next( err );
    return next;
  }
  
  // Will feed a flow with records streamed from the file
  var change_flow = fluid();
  var error;
  // Freeze time. It gets back to normal when change flow is processed fully
  now.now = 1;
  
  change_flow // .log( "Restore" )
  
  .map( function( v ){
    machine.activate();
    var decoded;
    try{
      decoded = json_decode( v );
    }catch( err ){
      trace( "Cannot decode json log entry", v, ", " + err );
      // debugger;
      return; // void
    }
    // Keep track of all valid changes
    machine.changes.push( v );
    return decoded;
  })
  
  .failure( function( err ){
    // ToDo: errors should terminate program
    error = err;
    change_flow.close();
  })
  
  .final( function(){
    de&&bug( "End of restore" );
    // restore done. what is now pushed to "changes" gets logged
    restore_done = true;
    // Unfreeze time, get back to normal time
    set_now( 0 );
    // Log version
    if( Change.version !== Change.versioning ){
      Change.versioning = null;
      step( function(){
        Change.inject({ t: "Version", o: "inject", p: { label: Change.version } } ); 
      } );
    }
    next( error );
  })
  
  .to( a_fluid );
  
  // Use a Nodejs stream to read from previous changes from json text file
  // Use npm install split module to split stream into crlf lines
  var all_changes = [];
  var split = require( "split" );
  var input = fs.createReadStream( fn );
  input
  
  .on( "error", function( err    ){
    trace( "Error about test/vote.json", err );
    change_flow.fail( err );
    change_flow.close();
  })
  
  .pipe( split( JSON.parse ) )
  
  // ToDo: use "readable" + read() to avoid filling all data in memory
  .on( "data",  function( change ){ 
    if( !all_changes )return;
    de&&bug( "Read change", all_changes.length + 1, pretty( change, 2 ) );
    try{
      // change_flow.push( change );
      all_changes && all_changes.push( change );
    }catch( err ){
      trace( "Cannot push change from file", fn, err, err.stack );
      debugger;
    }
  } )
  
  .on( "error", function( err ){
    if( ("" + err ).indexOf( "Unexpected end of input" ) === -1 ){
      trace( "Restore, stream split error", err );
      // only "unexpected end of input" is a valid error
      all_changes = null;
      change_flow.fail( err );
    }else{
      de&&bug(
        "Restore, line", (all_changes && all_changes.length + 1 ) || 0,
        "ok" // expected error:", err
      );
    }
  })
  
  .on( "end", function(){
    de&&bug( "EOF reached", fn );
    // Now, let's push these changes into the change flow
    if( all_changes ){
      all_changes.forEach( function( change ){
        change_flow.push( change );
      });
    }
    change_flow.close();
  });
  
  return next;
}

 
fluid.method( "pretty", function(){
  return fluid.it.map( function( it ){ return pretty( it ); } );
} );


function start( bootstrap, cb ){
// Start the "change processor".
// It replays logged changes and then plays new ones.
// When there is no log, it bootstraps first.
  
  if( !cb ){ cb = boxon(); }
  
  // Do nothing when running browser side. Change.process() will init stuff
  var restore_file_name = "ephemeral.json.log";
  if( exports.store ){
    restore_file_name = exports.store; 
  }
  var machine = Machine.current;
  if( Machine.current !== Machine.main ){
    restore_file_name = Machine.current.id + "." + restore_file_name;
  }
  var time_started = l8.update_now();
  de&&dump_entities();
  
  // Here is the "change processor"
  var current_change;
  Change.fluid
  .map( function( change ){
    machine.activate();
    try{
      current_change = deref( change );
    }catch( err ){
      trace( "Change deref error", err, err.stack );
      debugger;
      throw new Error( "EphemeralChangeDerefError" );
    }
    de&&bug( "Change:", pretty( current_change, 2 ) );
    // if( current_change.p.id_key === "@jhr.sortirdeleuro" )debugger;
    var r;
    try{
      r = Change.prototype.process.call( current_change );
    }catch( err ){
      trace( "Change process error", err, err.stack );
      trace( "Change:", pretty( current_change ) );
      debugger;
      throw err;
    }
    return r; })
  .failure( function( err ){
      trace( "Change processor error", err, err.stack );
      trace( "Change:", pretty( current_change ) );
      debugger;
  })
  ;//.pretty().log();
  
  // On the client side, persistance is via a fluid instead of a file
  if( l8.client ){
    cb();
    return;
  }
  
  // It replays old changes and log new ones
  persist(
    restore_file_name,
    Change.fluid,
    function( item ){ return item.t !== "Trace"; } // filter trace entities
  ).boxon( function( err ){
    var ready = boxon();
    if( !err ){
      de&&bug( "Restored from " + restore_file_name );
      ready();
    }else{
      trace( "Restore error", err, err.stack );
      // ToDo: handle error, only ENOENT is ok, ie file does not exist
      de&&bug( "Bootstrapping" );
      time_started = l8.update_now();
      var step_list = bootstrap ? bootstrap() : [];
      step_list.push( function(){
        trace( "Bootstrap duration: "
          + ( l8.update_now() - time_started )
          + " ms"
        );
      } );
      try{
        steps( step_list ).boxon( function( err ){
          de&&bug( "Bootstrap done" );
          ready( err );
        });
      }catch( err ){
        trace( "Bootstrap error", err, err.stack );
        ready( err );
      }
    }
    // Use setTimeout() to empty whatever queued activity may have happened,
    // like postponed expirations for example.
    setTimeout( function(){
      ready( function( err ){
        false && de&&dump_entities();
        machine.activate();
        trace( "Start duration: "
          + ( l8.update_now() - time_started )
          + " ms"
        );
        if( err ){
          CRITICAL( "Cannot proceed, corrupted " + restore_file_name );
          dump_entities();
          try{
            cb( err ); // new Error( "Corrupted store" ) );
          }catch( err_bis ){
            trace( "Client disaster error", err_bis, err_bis && err_bis.stack );
            trace( "From error", err, err.stack );
            CRITICAL( "Client error" );
          }
        }else{
          INFO( "READY" );
          try{
            cb();
          }catch( err ){
            trace( "Client error", err, err && err.stack );
            CRITICAL( "Client error" );
          }
        }
      });
    }, 1 );
  });
}


// More exports

Ephemeral.Ephemeral = Ephemeral;
Ephemeral.Machine = Machine;
Ephemeral.Change  = Change;


Ephemeral.start = function( bootstrap, cb ){
  // id 0...9999 are reserved for meta objects
  NextId = MaxSharedId + 1;
  start( bootstrap, cb );
};


var restoring = 0;
var restore_queue = [];

Ephemeral.restore = function( changes, done_cb, progress_cb ){
// Restore changes to the ephemeral data base. Async.
  // Queue if already restoring, unless special marker
  if( restoring && this !== restore_queue ){
    restore_queue.push( arguments );
    return;
  }
  if( !Array.isArray( changes ) ){
    changes = [ changes ];
  }
  if( this !== restore_queue && !progress_cb && !done_cb ){
    now.now = 1;
    Ephemeral.Change.process( changes );
    set_now();
  }else{
    restoring++;
    Ephemeral.Change.process(
      changes,
      function( err ){
        restoring--;
        if( err ){
          console.log( "BUG, unexpected error in Ephemeral.restore()", err );
          done_cb && setTimeout( function(){ done_cb( err ); }, 10 );
          return;
        }
        // Is there queued work to do?
        var head = restore_queue.shift();
        if( head ){
          // Hack: use restore_queue as a marker to avoid beeing queued
          Ephemeral.restore.apply( restore_queue, head );
        }
        done_cb && setTimeout( done_cb, 10 );
      },
      function( idx, last ){
        if( !idx ){
          now.now = 1;
        }
        if( last ){
          set_now();
        }
        progress_cb && progress_cb( idx, last );
      }
    );
  }
};


Ephemeral.inject = function( t, p ){
  if( Array.isArray( t ) )return steps( t );
  if( t === "Array" )return steps( p );
  if( Stepping ){
    return Change.inject( { t: t, o: "inject", p: p } );
  }else{
    return steps( [
      function(){
        Change.inject( { t: t, o: "inject", p: p } );
      }
    ]);
  }
};


Ephemeral.get_entity = function( id ){
  return lookup( id );
};


Ephemeral.get_all_entities = function(){
  return AllEntities;
};


Ephemeral.get_next_id = function(){
  return NextId;
};


Ephemeral.json_encode = json_encode;
Ephemeral.json_decode = json_decode;


Ephemeral.ref = ref;

return exports;

} // end of function ephemeral()

module.exports = ephemeral;
