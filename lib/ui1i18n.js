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
    "login": "en", // ie: use the "en" version of "login"
    "i-light version": '<span class="glyphicon glyphicon-phone"></span>',
    "i-propositions": '<span class="glyphicon glyphicon-search"></span>',
    "i-Propositions": '<span class="glyphicon glyphicon-search"></span>',
    "i-Search": '<span class="glyphicon glyphicon-search"></span>',
    "i-Sort": '<span class="glyphicon glyphicon-sort"></span>',
    "i-tag": '<span class="glyphicon glyphicon-tag"></span>',
    "i-tags": '<span class="glyphicon glyphicon-tags"></span>',
    "i-Tags": '<span class="glyphicon glyphicon-tags"></span>',
    "i-help": '<span class="glyphicon glyphicon-question-sign"></span>',
    "i-you": '<span class="glyphicon glyphicon-user"></span>',
    "i-login": '<span class="glyphicon glyphicon-log-in"></span>',
    "i-signout": '<span class="glyphicon glyphicon-log-out"></span>',
    "i-wiki": '<span class="glyphicon glyphicon-edit"></span>',
    "i-delegates": '<span class="glyphicon glyphicon-user"></span>',
      // + '<span class="glyphicon glyphicon-user" aria-hidden="true"></span>'
      // + '<span class="glyphicon glyphicon-user" aria-hidden="true"></span>',
    "i-Delegates": '<span class="glyphicon glyphicon-user"></span>',
      // + '<span class="glyphicon glyphicon-user" aria-hidden="true"></span>'
      // + '<span class="glyphicon glyphicon-user" aria-hidden="true"></span>',
    "i-Remove": '<span class="glyphicon glyphicon-remove-circle"></span>',
    "i-hide": '<span class="glyphicon glyphicon-remove-circle"></span>',
    "i-delegations": '<span class="glyphicon glyphicon-user"></span>',
      // + '<span class="glyphicon glyphicon-user" aria-hidden="true"></span>'
      // + '<span class="glyphicon glyphicon-user" aria-hidden="true"></span>',
    "i-visitor": '<span class="glyphicon glyphicon-user"></span>',
    "i-persona": '<span class="glyphicon glyphicon-user"></span>',
    "i-personas": '<span class="glyphicon glyphicon-user"></span>',
    "i-voters": '<span class="glyphicon glyphicon-user"></span>',
    "i-votes": '<span class="glyphicon glyphicon-comment"></span>',
    "i-vote": '<span class="glyphicon glyphicon-comment"></span>',
    "i-ballot": '<span class="glyphicon glyphicon-calendar"></span>',
    "i-computed": '<span class="glyphicon glyphicon-filter"></span>'
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
    "?":                "&nbsp;?",
    "tag":           "hashtag",
    "tags":          "hashtags",
    "delegations":   "délégations",
    "Delegations":   "Délégations",
    "Delegates":     "Délégués",
    "proposition":   __,
    "propositions":  __,
    "Tags":          "Hashtags",
    "persona":       "personne",
    "personas":      "personnes",
    "delegates":     "délégués",
    "computed":      "calculé",
    "b-Tags":           "Hashtags",
    "b-Tag":            "Tagger",
    "b-Untag":          "Détagger",
    "b-Search":         "Recherche",
    "b-Sort":           "Trier",
    "b-Query":          "Demander",
    "b-Delegate":       "Déléguer",
    "delegate":         "délégué",
    "virtual democracy": "démocratie virtuelle",
    "democracy":        "démocratie",
    "Search":           "Recherche",
    "Login":            "Connexion",
    "Sort":             "Trier",
    "Sign out":         "Déconnexion",
    "Help":             "Aide",
    "you":           "vous",
    "you too":          "vous aussi",
    "other":            "autre",
    "by":               "par",
    "since":            "depuis", // cré&eacute",
    "change":           "changement",
    "last vote":        "dernier vote",
    "end in":           "se termine dans",
    "currently":        "pour l'instant",
    "recommendations:": "recommendations : ",
    "il y a ":          "il y a ",
    "just now":         "à l'instant",
    " seconds ago":     " secondes",
    "1 minute ago":     "il y a une minute",
    " minutes ago":     " minutes",
    "about an hour ago":   "il y a une heure et quelque",
    " hours ago":       " heures",
    "yesterday":        "hier",
    " months":          " mois",
    " days":            " jours",
    " hours":           " heures",
    " seconds":         " secondes",
    " days ago":        " jours",
    " weeks ago":       " semaines",
    " months ago":      " mois",
    "for":              "pour",
    ":":                " : ",      // French rule
    "help":             "aide",
    "hide":             "cacher",
    "login":            "se connecter", // "connexion",
    "date":             "date",
    "none(e)":          "aucune",
    "sign out":         "déconnexion",
    "& clear":          "& effacer",
    "Back online":      "De retour en ligne",
    "Stay offline?":    "Rester hors-ligne ?",
    "ballot":         "urnes",
    "Ballot":           "Urnes",
    "Log":              "Historique",
    "agree":            "d'accord",
    "#agree":           "#d'accord",
    "disagree":         "pas-d'accord",
    "#disagree":        "#pas-d'accord",
    "blank":            "blanc",
    "#blank":           "#blanc",
    "protest":          "protestation",
    "#protest":         "#protestation",
    "abuse":            "abusif",
    "#abuse":           "#abusif",
    "but":              "sauf",
    "#but":             "#sauf",
    "#tag":             "#hashtag",
    "problematic":      "problématique",
    "#problematic":     "#problématique",
    "orphan":           "orphelin",
    "#orphan":          "#orphelin",
    "referendum":       "référendum",
    "#referendum":      "#référendum",
    "draft":            "ébauche",
    "#draft":           "#ébauche",
    "impersonal":       "impersonel",
    "#impersonal":      "#impersonel",
    "neutral":          "neutre",
    "against":          "contre",
    "#new":             "#nouveau",
    "new":              "nouveau",
    "#hot":             "#chaud",
    "hot":              "chaud",
    "#recent":          "#récent",
    "recent":           "récent",
    "#trust":           "#confiance",
    "trust":            "confiance",
    "#win":             "#gagnant",
    "win":              "gagnant",
    "#tie":             "#égalité",
    "tie":              "égalité",
    "#today":           "#aujourdhui",
    "today":            "aujourdhui",
    "#yesterday":       "#hier",
    "more than":        "plus de",
    "between":          "entre",
    "and":              "et",
    "other&nbsp;dates": "autres&nbsp;dates",
    "or":               "ou bien",
    "details":          "détails",
    "about":            "pour",
    "Summary":          "Résumé",
    "comment":          "commentaire",
    "comments":         "commentaires",
    "voter":            "votant",
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
    "security":      "sécurité",
    "direct(s)":     "directs",
    "indirect(s)":   "indirects",
    "Filter":        "Filtrer",
    "Vote":          "Voter",
    "or vote":       "ou bien voter",
    "Propose":       "Proposer",
    "visitor":       "visiteur",
    "Delegate":      "Déléguer",
    "Results":       "Résultats",
    "People":        "Personnes",
    "Trust":         "Confiance",
    "Comment":       "Commenter",
    "Domain":        "Domaine",
    "main":          "principal",
    "#domain":       "#domaine",
    "domain":        "domaine",
    "Visit":         "Visiter",
    // "light version": "version allégée",
    "privacy":       "secret",
    "private":       "privé",
    "one year":      "un an",
    "one month":     "un mois",
    "one week":      "une semaine",
    "24 hours":      "24 heures",
    "one day":       "un jour",
    "one hour":      "une heure",
    "expire":        "expirée",
    "duration":      "durée",
    "total votes":   "nombre de votes",
    "low first":     "faible d'abord",
    "old first":     "ancien d'abord",
    "cold first":    "froid d'abord",
    "author":        "auteur",
    "trust level":   "niveau de confiance",
    "creation date": "date de création",
    "reversed":      "inversé",
    "vote activity": "activité des votes",
    "direct participation": "participation directe",
    "An alias":      "Un alias",
    "optional":      "optionnel",
    "success":       "succés",
    "@your_name":    "@votre_nom",
    
    "Your delegates": "Vos délégués",
    "indirect votes": "votes indirects",
    "additional tag": "tag additionnel",
    " is a good tag": " est un bon hashtag",
    "accepted first": "faible d'abord",
    "global activity": "activité globale",
    "optional comment": "commentaire optionnel",
    "relevance (heat)": "pertinence (chaleur)",
    "your delegations": "vos délégations",
    "Your delegations": "Vos délégations",
    "proposition name": "nom de proposition",
    "without tags yet": "sans hashtag pour l'instant",
    "comment your vote":  "commenter votre vote",
    "Your twitter name": "Votre nom twitter",
    "less active first": "moins actifs d'abord",
    "number of comments": "nombre de commentaires",
    "tagged delegations": "délégations taggées",
    "last activity date": "date de dernière activité",
    "tagged propositions": "propositions taggées",
    "new&nbsp;proposition": "nouvelle&nbsp;proposition",
    "small successes first": "petits succés d'abord",
    "blank or protest votes": "blancs ou protestations",
    "without a vote from you": "sans vote de votre part",
    "If logged in, you can vote.": "Si vous êtes connecté, vous pouvez voter.",
    ' create a new proposition: ': " créez une proposition : ",
    "This page lists propositions.": "Cette page affiche des propositions.",
    "few delegations or votes first": "sans délégations d'abord",


    "If logged in, you can delegate.":
      "Si vous êtes connecté, vous pouvez déléguer.",
    "or select desired tags: ":
      "ou bien sélectionnez les hashtags désirés : ",
    "supposedly worth considering":
      "supposément digne d'attention",
    "about tags themselves":
      "au sujet des hashtags eux-mêmes",
    "about a persona":
      "au sujet d'une personne",
    "not about a persona":
      "pas au sujet d'une personne",
    "with at least a vote by a delegate":
      "avec au moins un vote par un délégué",
    'with a majority of "agree" votes':
      'avec une majorité de votes "d\'accord"',
    'with a majority of "blank" votes':
      'avec une majorité de votes "blanc"',
    'with a majority of "protest" votes':
      'avec une majorité de votes "protestation"',
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
      "avec 1 à 10% de participation",
    "with 10 to 20% participation":
      "avec 10 à 20% de participation",
    "with 20 to 25% participation":
      "avec 20 à 25% de participation",
    "with 25 to 33% participation":
      "avec 25 à 33% de participation",
    "with 33 to 50% participation":
      "avec 33 à 50% de participation",
    "with 50 to 66% participation":
      "avec 50 à 66% de participation",
    "with 66 to 75% participation":
      "avec 66 à 75% de participation",
    "with 75 to 80% participation":
      "avec 75 à 80% de participation",
    "with 80 to 90% participation":
      "avec 80 à 90% de participation",
    "with 90 to 100% participation":
      "avec 90 à 100% de participation",
    "updated during the last 48 hours but not today":
      "actif au cours de 48 dernières heures mais pas aujourd'hui",
    "with a vote that will expire soon (within less than a week)":
      "avec un vote sur le point d'expirer (dans moins d'une semaine)",
    "with a vote from a delegation that became inactive":
      "avec un vote issu d'une délégation devenue inactive",
    "#tags to find or plain text to look for":
      "#hastags à trouver ou mots à rechercher",
    "new propositions with votes from 1% of visitors":
      "nouveau, avec les votes d'au moins 1% des visiteurs",
    "This page lists direct individual votes on propositions.":
      "Cette page affiche les votes individuels directs sur des propositions.",
    "Results are about votes of whoever casted a vote on proposition":
      "Les résultats concernent les votes de quiconque a émis un vote sur la proposition",
    "This page lists indirect votes via delegates and associated tags.":
      "Cette page affiche des votes indirects via des délégués et des hashtags associés.",
    "This page list informations about you, your votes, your delegations, etc.":
      "Cette page affiche des informations vous concernant, vos votes, vos délégations, etc.",
    "You can change the limit dates, the propositions and the authorized voters: ":
      "Vous pouvez changer les dates limites et les propositions ainsi que les votants autorisés : ",
    "This page lists results for specified voters on specified propositions, with a date limit.":
      "Cette page affiche les résultats pour les votants indiqués au sujet de propositions, avec une date butoir.",
    "This page lists informations about a person, her votes, her delegations (received and given), etc.":
      "Cette page affiche des informations au sujet d'une personne, de ses votes, de ses délégations (données et reçues), etc.",
    "This page lists your delegations to others who vote for you on propositions that match some specified tags.":
      "Cette page affiche vos délégations à d'autres qui votent pour vous sur des propositions correspondants à certains hashtags.",
      
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
s( fr, "event",                        "Evénement" );
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

