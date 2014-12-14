/*
 *  ui1i18n.js
 *    Kudocracy UI1's internationalization
 *
 *  August 14 2014, from earlier work in SimpliWiki
 */
 
"use strict";

var __ = "_";
var en = "en";
var fr = "fr";
var es = "es";
var de = "de";
var it = "it";

var table; 

module.exports = table = {
  
  // Default "international" version, when no better local version
  _: {
    "<strong>Kudo<em>c</em>racy</strong>": __,
    "light version": '<span class="glyphicon glyphicon-phone"></span>',
    // "login": "en", // ie: use the "en" version of "login"
    "propositions": '<span class="glyphicon glyphicon-search"></span>',
    "Propositions": '<span class="glyphicon glyphicon-search"></span>',
    "Search": '<span class="glyphicon glyphicon-search"></span>',
    "Sort": '<span class="glyphicon glyphicon-sort"></span>',
    "tag": '<span class="glyphicon glyphicon-tag"></span>',
    "tags": '<span class="glyphicon glyphicon-tags"></span>',
    "Tags": '<span class="glyphicon glyphicon-tags"></span>',
    "help": '<span class="glyphicon glyphicon-question-sign"></span>',
    "you": '<span class="glyphicon glyphicon-user"></span>',
    "login": '<span class="glyphicon glyphicon-user" aria-hidden="true"></span>',
    "delegates": '<span class="glyphicon glyphicon-user"></span>'
      + '<span class="glyphicon glyphicon-user" aria-hidden="true"></span>'
      + '<span class="glyphicon glyphicon-user" aria-hidden="true"></span>',
    "Delegates": '<span class="glyphicon glyphicon-user"></span>'
      + '<span class="glyphicon glyphicon-user" aria-hidden="true"></span>'
      + '<span class="glyphicon glyphicon-user" aria-hidden="true"></span>',
    "delegations": '<span class="glyphicon glyphicon-user"></span>'
      + '<span class="glyphicon glyphicon-user" aria-hidden="true"></span>'
      + '<span class="glyphicon glyphicon-user" aria-hidden="true"></span>',
    "visitor": '<span class="glyphicon glyphicon-user"></span>',
    "persona": '<span class="glyphicon glyphicon-user"></span>',
    "personas": '<span class="glyphicon glyphicon-user"></span>',
    "voters": '<span class="glyphicon glyphicon-user"></span>',
    "votes": '<span class="glyphicon glyphicon-comment"></span>',
    "vote": '<span class="glyphicon glyphicon-comment"></span>',
    "ballot": '<span class="glyphicon glyphicon-calendar"></span>',
    "computed": '<span class="glyphicon glyphicon-filter"></span>'
  },
  
  // English version, for non english constructs
  en: {
    // "persona": "person",
    // "login": "sign in", // __,
    "b-Tags":        "Tags",
    "b-Search":      "Search",
    "b-Sort":        "Sort",
    "b-Tag":         "Tag",
    "b-Untag":       "Untag",
    "b-Query":       "Query",
    "b-Delegate":    "Delegate",
    "il y a ":         " ",
    "il y a environ ": "about ",
    "all(e)": "all",
    "all(s)": "all",
    "none(e)": "none",
    "direct(s)": "direct",
    "indirect(s)": "indirect"
  },
  
  // French version
  fr: {
    "?":             "&nbsp;?",
    // "tag":           "hashtag",
    // "tags":          "hashtags",
    // "delegations":   "d&eacute;l&eacute;gations",
    // "Delegations":   "D&eacute;l&eacute;gations",
    // "Delegates":     "D&eacute;l&eacute;gu&eacute;s",
    // "proposition":   __,
    // "propositions":  __,
    // "Tags":          "Hashtags",
    // "persona":       "personne",
    // "personas":      "personnes",
    // "delegates":     "d&eacute;l&eacute;gu&eacute;s",
    // "computed":      "calcul&eacute;",
    "b-Tags":        "Hashtags",
    "b-Tag":         "Tagger",
    "b-Untag":       "D&eacute;tagger",
    "b-Search":      "Chercher",
    "b-Sort":        "Trier",
    "b-Query":       "Demander",
    "b-Delegate":    "D&eacute;l&eacute;guer",
    "delegate":      "d&eacute;l&eacute;gu&eacute;",
    "virtual democracy": "d&eacute;mocratie virtuelle",
    "A direct democracy!": "Une d&eacute;mocratie directe !",
    "democracy":    "d&eacute;mocratie",
    // "you":          "vous",
    "you too":      "vous aussi",
    "other":        "autre",
    "by":           "par",
    "since":        "depuis", // cr&eacute;&eacute",
    "change":       "changement",
    "last vote":    "dernier vote",
    "end in":       "se termine dans",
    "il y a ":      "il y a ",
    "just now":     "&agrave; l'instant",
    " seconds ago": " secondes",
    "1 minute ago": "il y a une minute",
    " minutes ago": " minutes",
    "about an hour ago":   "il y a une heure et quelque",
    " hours ago":   " heures",
    "yesterday":    "hier",
    " months":      " mois",
    " days":        " jours",
    " hours":       " heures",
    " seconds":     " secondes",
    " days ago":    " jours",
    " weeks ago":   " semaines",
    " months ago":  " mois",
    "for":          "pour",
    ":":            " : ",      // French rule
    // "help":          "aide",
    "hide":          "cacher",
    // "login":         "se connecter", // "connexion",
    "date":          "date",
    "none(e)":       "aucune",
    "sign out":      "d&eacute;connexion",
    "& clear":       "& effacer",
    "Back online":   "De retour en ligne",
    "Stay offline?": "Rester hors-ligne ?",
    //"ballot":        "urnes",
    "Ballot":        "Urnes",
    "Log":           "Historique",
    "agree":         "d'accord",
    "#agree":        "#d'accord",
    "disagree":      "pas-d'accord",
    "#disagree":     "#pas-d'accord",
    "blank":         "blanc",
    "#blank":        "#blanc",
    "protest":       "protestation",
    "#protest":      "#protestation",
    "abuse":         "abusif",
    "#abuse":        "#abusif",
    "but":           "sauf",
    "#but":          "#sauf",
    "#tag":          "#hashtag",
    "problematic":   "probl&eacute;matique",
    "#problematic":  "#probl&eacute;matique",
    "orphan":        "orphelin",
    "#orphan":       "#orphelin",
    "referendum":    "r&eacute;f&eacute;rendum",
    "#referendum":   "#r&eacute;f&eacute;rendum",
    "draft":         "&eacute;bauche",
    "#draft":        "#&eacute;bauche",
    "impersonal":    "impersonel",
    "#impersonal":   "#impersonel",
    "neutral":       "neutre",
    "against":       "contre",
    "#new":          "#nouveau",
    "new":           "nouveau",
    "#hot":          "#chaud",
    "hot":           "chaud",
    "#recent":       "#r&eacute;cent",
    "recent":        "r&eacute;cent",
    "#trust":        "#confiance",
    "trust":         "confiance",
    "#win":          "#gagnant",
    "win":           "gagnant",
    "#tie":          "#&eacute;galit&eacute;",
    "tie":           "&eacute;galit&eacute;",
    "#today":        "#aujourdhui",
    "today":         "aujourdhui",
    "#yesterday":    "#hier",
    "more than":     "plus de",
    "between":       "entre",
    "and":           "et",
    "other dates":   "autres dates",
    "or":            "ou bien",
    "details":       "d&eacute;tails",
    "about":         "pour",
    "Summary":       "R&eacute;sum&eacute;",
    "comment":       "commentaire",
    "comments":      "commentaires",
    "voter":         "votant",
    // "voters":        "votants",
    "Voters":        "Votants",
    "more":          "plus",
    "less":          "moins",
    "Step":          "Etape",
    "Your votes":    "Vos votes",
    "direct vote":   "vote direct",
    "direct votes":  "votes directs",
    "indirect vote": "vote indirect",
    "all":           "tout",
    "all(e)":        "toutes",
    "all(s)":        "tous",
    "Twitter authentication": "Authentification par twitter",
    "Twitter domain": "Domaine Twitter",
    "Authorize":     "Autoriser",
    "Personal tag":  "Tag personnel",
    "Domain propositions": "Propositions du domaine",
    "security":      "s&eacute;curit&eacute;",
    "direct(s)":     "directs",
    "indirect(s)":   "indirects",
    "Filter":        "Filtrer",
    "Vote":          "Voter",
    "Propose":       "Proposer",
    "Delegate":      "D&eacute;l&eacute;guer",
    "Results":       "R&eacute;sultats",
    "People":        "Personnes",
    "Trust":         "Confiance",
    "Comment":       "Commenter",
    "Domain":        "Domaine",
    "main":          "principal",
    "#domain":       "#domaine",
    "domain":        "domaine",
    "Visit":         "Visiter",
    // "light version": "version all&eacute;g&eacute;e",
    "privacy":       "secret",
    "private":       "priv&eacute;",
    "one year":      "un an",
    "one month":     "un mois",
    "one week":      "une semaine",
    "24 hours":      "24 heures",
    "one day":       "un jour",
    "one hour":      "une heure",
    "expire":        "expir&eacute;e",
    "duration":      "dur&eacute;e",
    "total votes":   "nombre de votes",
    "low first":     "faible d'abord",
    "old first":     "ancien d'abord",
    "cold first":    "froid d'abord",
    "author":        "auteur",
    "trust level":   "niveau de confiance",
    "creation date": "date de cr&eacute;ation",
    "reversed":      "invers&eacute;",
    "vote activity": "activit&eacute; des votes",
    "direct participation": "participation directe",
    "An alias":      "Un alias",
    "optional":      "optionnel",
    "success":       "succ&eacute;s",
    "@your_name":    "@votre_nom",
    
    "Your delegates": "Vos d&eacute;l&eacute;gu&eacute;s",
    "indirect votes": "votes indirects",
    "additional tag": "tag additionnel",
    " is a good tag": " est un bon hashtag",
    "accepted first": "faible d'abord",
    "new proposition": "nouvelle proposition",
    "global activity": "activit&eacute; globale",
    "relevance (heat)": "pertinence (chaleur)",
    "your delegations": "vos d&eacute;l&eacute;gations",
    "Your delegations": "Vos d&eacute;l&eacute;gations",
    "proposition name": "nom de proposition",
    "without tags yet": "sans hashtag pour l'instant",
    "comment your vote":  "commenter votre vote",
    "Your twitter name": "Votre nom twitter",
    "less active first": "moins actifs d'abord",
    "number of comments": "nombre de commentaires",
    "tagged delegations": "d&eacute;l&eacute;gations tagg&eacute;es",
    "last activity date": "date de derni&egrave;re activit&eacute;",
    "tagged propositions": "propositions tagg&eacute;es",
    "small successes first": "petits succ&eacute;s d'abord",
    "blank or protest votes": "blancs ou protestations",
    "without a vote from you": "sans vote de votre part",
    "If logged in, you can vote.": "Si vous &ecirc;tes connect&eacute;, vous pouvez voter.",
    ' create a new proposition: ': " cr&eacute;ez une proposition : ",
    "This page lists propositions.": "Cette page affiche des propositions.",
    "few delegations or votes first": "sans d&eacute;l&eacute;gations d'abord",


    "If logged in, you can delegate.":
      "Si vous &ecirc;tes connect&eacute;, vous pouvez d&eacute;l&eacute;guer.",
    "or click to select/deselect desired tags: ":
      "ou bien cliquez pour s&eacute;lectionner/d&eacute;s&eacute;lectionner les hashtags d&eacute;sir&eacute;s : ",
    "about tags themselves":
      "au sujet des hashtags eux-m&ecirc;mes",
    "about a persona":
      "au sujet d'une personne",
    "with at least a vote by a delegate":
      "avec au moins un vote par un d&eacute;l&eacute;gu&eacute;",
    'with a majority of "agree" votes':
      'avec une majorit&eacute; de votes "d\'accord"',
    'with a majority of "blank" votes':
      'avec une majorit&eacute; de votes "blanc"',
    'with a majority of "protest" votes':
      'avec une majorit&eacute; de votes "protestation"',
    "with more than 1% of protest votes":
      'avec plus de 1% de votes "protestation"',
    "tags with a single proposition":
      "hashtags avec une seule proposition",
    "with a vote from you":
      "avec un vote de votre part",
    "with a direct vote from you":
      "avec un vote direct de votre part",
    "with an indirect vote from you":
      "avec un vote indirect en votre nom",
    'with an "agree" vote from you':
      "avec un vote \"d'accord\" de votre part",
    'with a "protest" vote from you':
      'avec un vote "protestation" de votre part',
    'with a "disagree" or "protest" vote from you':
      "avec un vote \"pas d'accord\" ou \"protestation\" de votre part",
    "with a comment from you":
      "avec un commentaire de votre part",
    "with more than 50% participation":
      "avec plus de 50% de participation",
    "with 1 to 10% participation":
      "avec 1 &agrave; 10% de participation",
    "with 10 to 20% participation":
      "avec 10 &agrave; 20% de participation",
    "with 20 to 25% participation":
      "avec 20 &agrave; 25% de participation",
    "with 25 to 33% participation":
      "avec 25 &agrave; 33% de participation",
    "with 33 to 50% participation":
      "avec 33 &agrave; 50% de participation",
    "with 50 to 66% participation":
      "avec 50 &agrave; 66% de participation",
    "with 66 to 75% participation":
      "avec 66 &agrave; 75% de participation",
    "with 75 to 80% participation":
      "avec 75 &agrave; 80% de participation",
    "with 80 to 90% participation":
      "avec 80 &agrave; 90% de participation",
    "with 90 to 100% participation":
      "avec 90 &agrave; 100% de participation",
    "updated during the last 48 hours but not today":
      "actif au cours de 48 derni&egrave;res heures mais pas aujourd'hui",
    "with a vote that will expire soon (within less than a week)":
      "avec un vote sur le point d'expirer (dans moins d'une semaine)",
    "with a vote from a delegation that became inactive":
      "avec un vote issu d'une d&eacute;l&eacute;gation devenue inactive",
    "Type #tags to find or plain text to look for: ":
      "Indiquez les #hastags à trouver ou des mots à rechercher : ",
    "new propositions with votes from 1% of visitors":
      "nouvelles propositions avec les votes d'1% des visiteurs",
    "This page lists direct individual votes on propositions.":
      "Cette page affiche les votes individuels directs sur des propositions.",
    "Results are about votes of whoever casted a vote on proposition":
      "Les r&eacute;sultats concernent les votes de quiconque a &eacute;mis un vote sur la proposition",
    "This page lists indirect votes via delegates and associated tags.":
      "Cette page affiche des votes indirects via des d&eacute;l&eacute;gu&eacute;s et des hashtags associ&eacute;s.",
    "This page list informations about you, your votes, your delegations, etc.":
      "Cette page affiche des informations vous concernant, vos votes, vos d&eacute;l&eacute;gations, etc.",
    "You can change the limit dates, the propositions and the authorized voters: ":
      "Vous pouvez changer les dates limites et les propositions ainsi que les votants autoris&eacute;s : ",
    "This page lists results for specified voters on specified propositions, with a date limit.":
      "Cette page affiche les r&eacute;sultats pour les votants indiqu&eacute;s au sujet de propositions, avec une date butoir.",
    "This page lists informations about a person, her votes, her delegations (received and given), etc.":
      "Cette page affiche des informations au sujet d'une personne, de ses votes, de ses d&eacute;l&eacute;gations (donn&eacute;es et re&ccedil;ues), etc.",
    "This page lists your delegations to others who vote for you on propositions that match some specified tags.":
      "Cette page affiche vos d&eacute;l&eacute;gations &agrave; d'autres qui votent pour vous sur des propositions correspondants à certains hashtags.",
      
    "end": "fin"
  }
};


// DSL for easy patches

var lang = "en";

function t( l, m, r ){
  if( arguments.length === 2 ){
    r = "_";
  }else if( arguments.length === 1 ){
    r = l;
    m = l;
    l = "_";
  }
  lang = l;
  table[ lang ][ m ] = r;
}


function s( l, m, r ){
  t( fr, m, m );
  t( en, m, r );
  t( l,  m, r );
  if( m[0] !== "#" ){
    s( l, "#" + m, "#" + r );
  }
}

// Patches
//t( __, "help", "?" );
//t( en, "help", "help" );
t( __, "alias" );


// Translate "sandbox" propositions, for demos
s( __, "politique",                    "politic" );
s( __, "environnement",                "environmental" );
s( __, "PeineDeMort",                  "DeathPenalty" );
s( __, "GraveRechauffementClimatique", "SeriousGlobalWarming" );
s( __, "SortirDeLeuro",                "LeaveTheEuro" );
s( __, "constituante",                 "NewConstitution" );
s( __, "Trait_TransA",                 "tafta" );
s( __, "LibreEchangeTA",               "tafta" );
s( fr, "DeathPenalty",                 "PeineDeMort" );
s( fr, "event",                        "Ev&eacute;nement" );
s( __, "ProPalestinien",               "ProPalestinian" );
s( __, "ProIsraelien",                 "ProIsraelian" );
s( __, "HalteAuNucleaire",             "StopNuclear" );
s( __, "RevenuDeBase",                 "BasicIncome" );
s( __, "SalaireAvie",                  "LifelongWage" );
s( __, "TirageAuSort",                 "RandomDraw" );
s( __, "AcceuillirSnowden",            "AsylumForSnowden" );
s( __, "CorseIndependante",            "IndependanceForCorsica" );
s( __, "Dissolution",                  "AssemblyDissolution" );
s( __, "RetourDeSarkozy",              "SarkozyComeback" );
s( __, "LegalisationDuCannabis",       "LegalizeCanabis" );
s( __, "InterdireLeFN",                "FNpartyBan" );
s( __, "VotesBlancsQuiComptent",       "BindingVoteNOTA");

