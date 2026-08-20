// Repère d'environnement — marque le desk NON-PRODUCTION.
//
// Cette VM est un clone de la production : mêmes données, même interface, mêmes
// identifiants. Rien à l'écran ne disait sur laquelle des deux on travaillait,
// alors qu'une saisie faite ici est perdue au prochain `bddevprod` et qu'un
// geste cru « de test » passé en prod, lui, ne se rattrape pas.
//
// La PRODUCTION reste STRICTEMENT INTACTE : ni barre teintée, ni préfixe de
// titre. Seul un site qui se déclare autre chose que « PROD » se signale. C'est
// voulu — l'écran des utilisateurs finaux ne doit rien porter de plus.
//
// La source est `environnement` dans site_config.json, exposée dans le bootinfo
// par param_global.install.extend_bootinfo. Ce fichier vit hors git et n'est pas
// écrasé par `bench restore` : il reste donc propre à sa machine, là où tout le
// reste (code des apps, base de données) voyage de l'une à l'autre.
//
// ⚠️ Clé absente = PROD, donc aucun marquage. Poser la clé sur la machine de
// DEV, jamais l'inverse :
//     bench --site amanatem.local set-config environnement DEV

$(function () {
	if (!pg_env_nom()) return;
	pg_env_injecter_css();
	pg_env_prefixer_titre(pg_env_nom());
	pg_env_appliquer();
});

// La navbar est reconstruite au fil des navigations : on repose le repère à
// chaque changement de page, comme le nom d'utilisateur (pg_ui_defaults).
$(document).on("page-change", function () {
	if (pg_env_nom()) pg_env_appliquer();
});

// Nom de l'environnement courant, "" quand il n'y a rien à signaler.
function pg_env_nom() {
	var env = (frappe.boot && frappe.boot.environnement) || "";
	env = String(env).trim().toUpperCase();
	return env === "PROD" || env === "PRODUCTION" ? "" : env;
}

function pg_env_appliquer() {
	var env = pg_env_nom();
	if (!env) return;
	// La teinte de la barre tient entièrement dans le CSS, sous cette classe :
	// le JS ne fait que la poser et insérer le libellé.
	$("body").addClass("pg-env");
	pg_env_poser_libelle(env);
}

function pg_env_poser_libelle(env) {
	if (document.getElementById("pg-env-badge")) return;

	var $home = $("header.navbar a.navbar-home").first();
	if (!$home.length) return;

	// Le complément de phrase est masqué sur petit écran (cf. CSS) : la navbar
	// d'un téléphone n'a pas la place, et « DEV » seul suffit à alerter.
	$home.after(
		"<span id='pg-env-badge' class='pg-env-badge' title='" +
			__("Ce site n'est PAS la production — les données saisies ici ne sont pas conservées.") +
			"'>" +
			frappe.utils.escape_html(env) +
			"<span class='pg-env-long'> &mdash; " +
			__("CE N'EST PAS LA PRODUCTION") +
			"</span></span>"
	);
}

// Titre de l'onglet préfixé « [DEV] », pour distinguer deux onglets ouverts
// côte à côte. `set_title_prefix` est un mécanisme natif de Frappe (utilisé par
// personne d'autre) : le préfixe est réappliqué tout seul à chaque changement de
// titre, sans rien patcher.
function pg_env_prefixer_titre(env) {
	if (frappe._title_prefix) return;
	var prefixe = "[" + env + "]";

	// `set_title_prefix` rejoue `set_title(frappe._original_title)`, qui appelle
	// `.replace()` dessus : au tout premier chargement le titre courant n'est pas
	// encore passé par le routeur et vaut `undefined`. On pose alors le préfixe à
	// la main — le prochain `set_title` s'en servira.
	if (frappe._original_title) {
		frappe.utils.set_title_prefix(prefixe);
	} else {
		frappe._title_prefix = prefixe;
		document.title = prefixe + " " + document.title;
	}
}

function pg_env_injecter_css() {
	if (document.getElementById("pg-env-style")) return;
	$("<style id='pg-env-style'>")
		.text(
			// Ambre CLAIR, et non un fond sombre : le texte de la navbar reste
			// celui de Frappe — dont le nom d utilisateur que pg_ui_defaults place
			// au centre de cette meme barre. Un fond sombre aurait oblige a
			// repeindre les icones et ce nom, bien au-dela d un simple repere.
			"body.pg-env header.navbar { background-color: #fac775 !important;" +
				" border-bottom: 1px solid #854f0b; }\n" +
				".pg-env-badge { margin-left: 12px; padding: 3px 10px; border-radius: 20px;" +
				" background-color: #412402; color: #faeeda; font-size: 11px; font-weight: 700;" +
				" letter-spacing: 0.6px; text-transform: uppercase; white-space: nowrap;" +
				" cursor: default; }\n" +
				"@media (max-width: 768px) { .pg-env-long { display: none; } }\n" +
				"@media print { .pg-env-badge { display: none !important; }\n" +
				" body.pg-env header.navbar { background-color: transparent !important;" +
				" border-bottom: 0 !important; } }"
		)
		.appendTo("head");
}
