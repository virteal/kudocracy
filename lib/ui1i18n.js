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
    "home": "Kudocracy",
    "login": "en", // ie: use the "en" version of "login"
    "Search #domain":  "?",
    "this_week": "7 days",
    "this_month": "a month",
    "this_year": "a year",
    
    // Icons
    "i-home":          '<span class="glyphicon glyphicon-home"></span>',
    "i-light version": '<span class="glyphicon glyphicon-phone"></span>',
    "i-proposition":   '<span class="glyphicon glyphicon-question-sign"></span>',
    "i-propositions":  '<span class="glyphicon glyphicon-question-sign"></span>',
    "i-Propositions":  '<span class="glyphicon glyphicon-question-sign"></span>',
    "i-Search":        '<span class="glyphicon glyphicon-search"></span>',
    "i-Sort":          '<span class="glyphicon glyphicon-sort"></span>',
    "i-tag":           '<span class="glyphicon glyphicon-tag"></span>',
    "i-tags":          '<span class="glyphicon glyphicon-tags"></span>',
    "i-Tags":          '<span class="glyphicon glyphicon-tags"></span>',
    "i-help":          '<span class="glyphicon glyphicon-info-sign"></span>',
    "i-you":           '<span class="glyphicon glyphicon-user"></span>',
    "i-twitter":       '<i class="fa fa-twitter twitter_bw"></i>',
    "i-twitter_blue":  '<i class="fa fa-twitter twitter_blue"></i>',
    "i-login":         '<i class="fa fa-twitter twitter_blue"></i><span class="glyphicon glyphicon-log-in"></span>',
    "i-signout":       '<span class="glyphicon glyphicon-log-out"></span>',
    "i-wiki":          '<span class="glyphicon glyphicon-edit"></span>',
    "i-delegates":     '<i class="fa fa-user-times"></i>',
    "i-Delegates":     '<i class="fa fa-user-times"></i>',
    "i-Remove":       '<span class="glyphicon glyphicon-remove-circle"></span>',
    "i-hide":         '<span class="glyphicon glyphicon-remove-circle"></span>',
    "i-show":         '<span class="show_button glyphicon glyphicon-fullscreen"></span>',
    "i-zoom-in":      '<span class="glyphicon glyphicon-zoom-in"></span>',
    "i-delegation":   '<i class="fa fa-user-times"></i>',
    "i-delegations":  '<i class="fa fa-user-times"></i>',
    "i-visitor":      '<span class="glyphicon glyphicon-user"></span>',
    "i-persona":      '<span class="glyphicon glyphicon-user"></span>',
    "i-personas":     '<span class="glyphicon glyphicon-user"></span>',
    "i-voters":       '<span class="glyphicon glyphicon-user"></span>',
    "i-votes":        '<span class="glyphicon glyphicon-comment"></span>',
    "i-vote":         '<span class="glyphicon glyphicon-comment"></span>',
    "i-comment":      '<span class="glyphicon glyphicon-comment"></span>!',
    "i-comments":     '<span class="glyphicon glyphicon-comment"></span>!',
    "i-ballot":       '<span class="glyphicon glyphicon-calendar"></span>',
    "i-computed":     '<span class="glyphicon glyphicon-filter"></span>',
    "i-arrow right":  '<span class="glyphicon glyphicon-arrow-right"></span>',
    "i-new-window":   '<span class="glyphicon glyphicon-new-window"></span>',
    "i-direct":       '<i class="fa fa-user-plus"></i>',
    "i-indirect":     '<i class="fa fa-user-times"></i>',
    "i-problematic":  '<i class="fa fa-exclamation"></i>>1%',
    "i-abuse":        '<i class="fa fa-exclamation-triangle"></i>',
    "i-quorum1":      '<i class="fa fa-line-chart"></i>1-10%',
    "i-quorum10":     '<i class="fa fa-line-chart"></i>10-20%',
    "i-quorum20":     '<i class="fa fa-line-chart"></i>20-25%',
    "i-quorum25":     '<i class="fa fa-line-chart"></i>25-33%',
    "i-quorum33":     '<i class="fa fa-line-chart"></i>33-50%',
    "i-quorum50":     '<i class="fa fa-line-chart"></i>50-66%',
    "i-quorum":       '<i class="fa fa-line-chart"></i>>50%',
    "i-quorum66":     '<i class="fa fa-line-chart"></i>66-75%',
    "i-quorum75":     '<i class="fa fa-line-chart"></i>75-80%',
    "i-quorum80":     '<i class="fa fa-line-chart"></i>80-90%',
    "i-quorum90":     '<i class="fa fa-line-chart"></i>90-100%',
    'eof':""
  },
  
  // English version, for non english constructs
  en: {
    // "persona": "person",
    // "login": "sign in", // __,
    "b-Tags":          "Tags",
    "b-Search":        "Search",
    "b-Sort":          "Sort",
    "b-Tag":           "Tag",
    "b-Untag":         "Untag",
    "b-Query":         "Query",
    "b-Delegate":      "Delegate",
    "il y a ":         " ",
    "il y a environ ": "about ",
    "all(e)":          "all",
    "all(s)":          "all",
    "none(e)":         "none",
    "direct(s)":       "direct",
    "indirect(s)":     "indirect"
  },
  
  // French version
  fr: {
    "Language":      "Langue",
    "?":             "&nbsp;?",
    "main":          "ici",
    "tag":           "tag",
    "tags":          "tags",
    "delegations":   "connexions", // "délégations",
    "Delegations":   "Connexions", // "Délégations",
    "Delegates":     "Amis",       // "Délégués",
    "Delegate":      "Suivre",     // "Déléguer",
    "proposition":   __,
    "propositions":  __,
    "Tags":          "Tags",
    "persona":       "personne",
    "personas":      "personnes",
    "delegates":     "amis",          // "délégués",
    "delegate too":  "suivre aussi",  // "déléguer aussi",
    "computed":      "calculé",
    "b-Tags":           "Tags",
    "b-Tag":            "Tagger",
    "b-Untag":          "Détagger",
    "b-Search":         "Recherche",
    "b-Sort":           "Trier",
    "b-Query":          "Demander",
    "b-Delegate":       "Suivre",    // "Déléguer",
    "delegate":         "ami",       // "délégué",
    "delegation":       "connexion", // "délégation",
    "virtual democracy": "démocratie virtuelle",
    "democracy":        "démocratie",
    "Search":           "Recherche",
    "login":            "se connecter",
    "login to vote":    "se connecter pour voter",
    "Sort":             "Trier",
    "help":             "aide",
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
    "some time ago":    "il y a un certain temps",
    "for another":              "pour encore",
    ":":                " : ",      // French rule
    "hide":             "cacher",
    "date":             "date",
    "empty":            "vide",
    "none(e)":          "aucune",
    "sign out":         "déconnexion",
    "Sign out":         "Déconnexion",
    "& clear":          "& effacer",
    "Back online":      "De retour en ligne",
    "Stay offline?":    "Rester hors-ligne ?",
    "ballot":           "urnes",
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
    "#tag":             "#tag",
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
    "among":            "parmi",
    "between":          "entre",
    "and":              "et",
    "other&nbsp;dates": "autres&nbsp;dates",
    "or":               "ou bien",
    "details":          "détails",
    "about":            "pour",
    "Summary":          "Résumé",
    "comment":          "commentaire",
    "#comment":         "#commentaire",
    "comments":         "commentaires",
    "voter":            "votant",
    // "voters":        "votants",
    "Voters":           "Votants",
    "more":             "plus",
    "minus":            "moins",
    "less":             "moins",
    "Step":             "Etape",
    "Your votes":       "Vos votes",
    "direct vote":      "vote direct",
    "direct votes":     "votes directs",
    "indirect vote":    "vote indirect",
    "votes today":      "votes aujourd'hui",
    "votes this week":  "votes depuis 7 jours",
    "7 days":           "7 jours",
    "votes this month": "votes depuis un mois",
    "a month":          "1 mois",
    "votes this year":  "votes sur un an",
    "a year":           "1 an",
    "this_week":        "7 jours",
    "this_month":       "1 mois",
    "this_year":        "1 an",
    "all":              "tout",
    "all(e)":           "toutes",
    "all(s)":           "tous",
    "Twitter authentication": "Authentification par twitter",
    "Twitter domain":   "Domaine Twitter",
    "Authorize":        "Autoriser",
    "Personal tag":  "Tag personnel",
    "Domain propositions": "Propositions du domaine",
    "security":        "sécurité",
    "direct(s)":       "directs",
    "indirect(s)":     "indirects",
    "Filter":          "Filtrer",
    "Vote":            "Voter",
    "Propose":         "Proposer",
    "visitor":         "visiteur",
    "Results":         "Résultats",
    "People":          "Personnes",
    "Trust":           "Confiance",
    "Comment":         "Commenter",
    "Domain":          "Domaine",
    "main domain":     "domaine principal",
    "#domain":         "#domaine",
    "domain":          "domaine",
    "Visit":           "Visiter",
    // "light version": "version allégée",
    "privacy":         "secret",
    "private":         "privé",
    "one year":        "un an",
    "one month":       "un mois",
    "one week":        "une semaine",
    "24 hours":        "24 heures",
    "one day":         "un jour",
    "one hour":        "une heure",
    "expire":          "expirée",
    "expired":         "expirée",
    "duration":        "durée",
    "now":             "maintenant",
    "total votes":     "nombre de votes",
    "low first":       "faible d'abord",
    "old first":       "ancien d'abord",
    "cold first":      "froid d'abord",
    "author":          "auteur",
    "trust level":     "niveau de confiance",
    "creation date":   "date de création",
    "reversed":        "inversé",
    "vote activity":   "activité des votes",
    "direct participation": "participation directe",
    "An alias":        "Un alias",
    "optional":        "optionnel",
    "success":         "succés",
    "@your_name":      "@votre_nom",
    "badges":          "badges",
    "web site":        "site web",
    "title":           "titre",
    "counters":        "compteurs",
    "counter":         "compteur",
    "compact":         "compact",
    
    "Your delegates": "Vos amis", // "Vos délégués",
    "indirect votes": "votes indirects",
    "additional tag": "tag additionnel",
    " is a good tag": " est un bon tag",
    "accepted first": "faible d'abord",
    "global activity": "activité globale",
    "optional comment": "intitulé optionnel",
    "relevance":        "pertinence",
    "less first":       "moins d'abord",
    "your delegations": "vos connexions", // "vos délégations",
    "Your delegations": "Vos connexions", // "Vos délégations",
    "proposition name": "nom de proposition",
    "without tags yet": "sans tag pour l'instant",
    "comment your vote":  "commenter votre vote",
    "Your twitter name": "Votre nom twitter",
    "less active first": "moins actifs d'abord",
    "number of comments": "nombre de commentaires",
    "tagged delegations": "amitiés taggées", // "délégations taggées",
    "last activity date": "date de dernière activité",
    "tagged propositions": "propositions taggées",
    "new&nbsp;proposition": "nouvelle&nbsp;proposition",
    "small successes first": "petits succés d'abord",
    "with recent activity": "avec de l'activité récente",
    "blank or protest votes": "blancs ou protestations",
    "without a vote from you": "sans vote de votre part",
    "with an agree/disagree equality": 'avec une égalité "d\'accord"/"pas d\'accord"',
    "If logged in, you can vote.": "Si vous êtes connecté, vous pouvez voter.",
    ' create a new proposition: ': " créez une proposition : ",
    "This page lists propositions.": "Cette page affiche des propositions.",
    "few delegations or votes first": "sans connexions d'abord", // "sans délégations d'abord",


    "If logged in, you can delegate.":
      "Si vous êtes connecté, vous pouvez suivre.", // déléguer.",
    "select desired tags: ":
      "sélectionnez les tags désirés : ",
    "supposedly worth considering":
      "supposément digne d'attention",
    "about tags themselves":
      "au sujet des tags eux-mêmes",
    "about a persona":
      "au sujet d'une personne",
    "not about a persona":
      "pas au sujet d'une personne",
    "with at least a vote by a delegate":
      "avec au moins un vote par un ami", // "délégué",
    'with a majority of "agree" votes':
      'avec une majorité de votes "d\'accord"',
    'with a majority of "blank" votes':
      'avec une majorité de votes "blanc"',
    'with a majority of "protest" votes':
      'avec une majorité de votes "protestation"',
    "with more than 1% of protest votes":
      'avec plus de 1% de votes "protestation"',
    "propositions without much votes":
      "propositions sans beaucoup de votes",
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
    'with a "disagree" vote from you':
      "avec un vote \"pas d'accord\" de votre part",
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
    "updated during the last 24 hours":
      "actif au cours de 24 dernières heures",
    "updated during the last 48 hours but not today":
      "actif au cours de 48 dernières heures mais pas aujourd'hui",
    "with a vote that will expire soon (within less than a week)":
      "avec un vote sur le point d'expirer (dans moins d'une semaine)",
    "with a vote from a delegation that became inactive":
      "avec un vote issu d'une amitié devenue inactive", // délégation
    "#tags to find or plain text to look for":
      "#tags à trouver ou mots à rechercher",
    "new propositions with votes from 1% of visitors":
      "nouveau, avec les votes d'au moins 1% des visiteurs",
    "This page lists direct individual votes on propositions.":
      "Cette page affiche les votes individuels directs sur des propositions.",
    "Results are about votes of whoever casted a vote on proposition":
      "Les résultats concernent les votes de quiconque a émis un vote sur la proposition",
    "This page lists indirect votes via delegates and associated tags.":
      "Cette page affiche des votes indirects via des amis et des tags associés.",
    "Add buttons to your website to help your visitors vote using Kudo<em>c</em>racy.":
      "Ajoutez des boutons à votre site web pour aider vos visiteurs à voter avec Kudo<em>c</em>racy.",
    "This page list informations about you, your votes, your delegations, etc.":
      "Cette page affiche des informations vous concernant, vos votes, vos amis, etc.", // délégations
    "You can change the limit dates, the propositions and the authorized voters: ":
      "Vous pouvez changer les dates limites et les propositions ainsi que les votants autorisés : ",
    "Try out your button, then copy and paste the code below into the HTML for your site.":
      "Essayez votre bouton, puis copiez/collez le code ci-dessous dans l'HTML de votre site.",
    "This page lists results for specified voters on specified propositions, with a date limit.":
      "Cette page affiche les résultats pour les votants indiqués au sujet de propositions, avec une date butoir.",
    "This page lists informations about a person, her votes, her delegations (received and given), etc.":
      "Cette page affiche des informations au sujet d'une personne, de ses votes, de ses amis (données et reçues), etc.", // délégations
    "This page lists your delegations to others who vote for you on propositions that match some specified tags.":
      "Cette page affiche les amis qui votent pour vous sur des propositions dot&eacute;es de certains tags.",
      
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

