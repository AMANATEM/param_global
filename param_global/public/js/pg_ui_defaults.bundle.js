localStorage.setItem("container_fullwidth", "true");
localStorage.setItem("pg_show_sidebar", "false");
localStorage.setItem("show_sidebar", "false");

// Le CSS natif de Frappe pour no-list-sidebar ne couvre que les pages List/
// (sélecteur : [data-page-route^="List/"]).  Pour les formulaires, Frappe applique
// un style inline via sidebar_wrapper.toggle() — il faut !important pour le neutraliser.
$(function () {
	if (!document.getElementById("param-no-sidebar")) {
		$("<style id='param-no-sidebar'>")
			.text(
				"body.pg-no-sidebar .layout-side-section { display: none !important; }\n" +
				"body.pg-no-sidebar .layout-main-section-wrapper { flex: 1 1 auto !important; }"
			)
			.appendTo("head");
	}
	_pg_apply();

	if (!document.getElementById("param-no-filterable")) {
		$("<style id='param-no-filterable'>")
			.text(
				".filterable { pointer-events: none !important; }\n" +
				".list-subject a:hover { text-decoration: none !important; }"
			)
			.appendTo("head");
	}
	if (frappe.views && frappe.views.ListView) {
		frappe.views.ListView.prototype.setup_filterable = function () {};
	}

	_pg_patch_longueur_liste();

	if (!document.getElementById("param-navbar-username-style")) {
		$("<style id='param-navbar-username-style'>")
			.text(
				"header.navbar > .container { position: relative; }\n" +
				".pg-navbar-username { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);" +
				" font-size: 15px; font-weight: 700; white-space: nowrap; pointer-events: none; }"
			)
			.appendTo("head");
	}
	_pg_show_navbar_username();
});

// Couleur d'accent par doctype transactionnel — reprend EXACTEMENT les couleurs
// « entête » déjà posées par chaque app sur ses propres pages Form/List
// (ex. retour.js/retour_list.js : .retour-entete-rouge { border-top: #b91c1c }).
// Une seule source de vérité pour ces valeurs serait plus propre, mais chaque
// app injecte son CSS de façon autonome (voir agents ayant audité ce pattern) ;
// on duplique donc ici volontairement les valeurs plutôt que de centraliser.
const PG_DOCTYPE_COLORS = {
	"Delivery Note": "#0f766e", // Bon de Livraison
	Retour: "#b91c1c",
	Quotation: "#2563eb", // Devis
	"Purchase Order": "#7c3aed", // Bon de Commande
	"Purchase Receipt": "#111827", // Bon de Réception
	"Stock Entry": "#ea580c", // Écriture de Stock
	"Stock Reconciliation": "#78350f", // Réconciliation Stock
};
const PG_FALLBACK_COLOR = "#0f766e"; // Vert émeraude — couleur d'accent officielle par défaut

// Nombre de lignes affichées par défaut dans TOUTES les listes du desk (toutes
// apps confondues). Frappe met 20 sur petit écran et 100 sur grand
// (base_list.js : `this.page_length = frappe.is_large_screen() ? 100 : 20`).
// 500 est l'une des valeurs proposées par la pagination native
// (`paging_values = [20, 100, 500, 2500]`), donc le bouton correspondant
// s'affiche bien comme actif.
const PG_LONGUEUR_LISTE = 500;

// On enveloppe `setup_defaults` de BaseList plutôt que de le réécrire : toutes
// les vues (Liste, Rapport, Kanban…) en héritent et appellent `super()` en
// premier, donc la valeur est posée juste après le défaut de Frappe et avant
// que la sous-classe ne poursuive. Aucune d'elles ne retouche `page_length`
// ensuite — sauf un **rapport sauvegardé**, qui applique la longueur stockée
// dans le document (report_view.js), et c'est le comportement voulu.
function _pg_patch_longueur_liste() {
	if (!frappe.views || !frappe.views.BaseList) return;
	var proto = frappe.views.BaseList.prototype;
	if (proto._pg_longueur_liste_patchee) return;

	var _setup_defaults_natif = proto.setup_defaults;
	proto.setup_defaults = function () {
		var resultat = _setup_defaults_natif.apply(this, arguments);
		this.page_length = PG_LONGUEUR_LISTE;
		// `selected_page_count` est la valeur que le bouton « 20 de plus »
		// reprend (`this.page_length = this.selected_page_count || 20`) : sans
		// elle, cliquer sur « Plus » retomberait à 20 lignes par page.
		this.selected_page_count = PG_LONGUEUR_LISTE;
		return resultat;
	};
	proto._pg_longueur_liste_patchee = true;
}

// Affiche le Nom d'utilisateur (champ `username`, alimenté dans le bootinfo par
// param_global.install.extend_bootinfo) centré dans le header, pour que
// l'utilisateur sache toujours avec quel compte il est connecté. Reste vide
// tant que le champ `username` n'est pas renseigné sur la fiche Utilisateur.
function _pg_show_navbar_username() {
	var $span = $("#pg-navbar-username");
	if (!$span.length) {
		var username = frappe.boot && frappe.boot.user && frappe.boot.user.username;
		if (!username) return;
		var $container = $("header.navbar > .container").first();
		if (!$container.length) return;
		$container.append(
			"<span id='pg-navbar-username' class='pg-navbar-username'>" +
				frappe.utils.escape_html(username) +
				"</span>"
		);
		$span = $("#pg-navbar-username");
	}
	var dt = _pg_current_doctype();
	$span.css("color", (dt && PG_DOCTYPE_COLORS[dt]) || PG_FALLBACK_COLOR);
}

// Doctype de la route courante (Liste ou Formulaire), pour la couleur d'accent.
function _pg_current_doctype() {
	try {
		var r = frappe.get_route && frappe.get_route();
		if (r && (r[0] === "List" || r[0] === "Form")) return r[1];
	} catch (e) {
		// ignore
	}
	return null;
}

$(document).on("page-change", function () {
	_pg_show_navbar_username();
});

function _pg_show_pref() {
	return localStorage.getItem("pg_show_sidebar") === "true";
}

// Exception : la vue impression (route « print/... ») doit toujours afficher la
// barre latérale, car c'est elle qui contient le sélecteur de format d'impression.
function _pg_is_print_view() {
	try {
		var r = frappe.get_route && frappe.get_route();
		return !!r && r[0] === "print";
	} catch (e) {
		return false;
	}
}

function _pg_apply() {
	var pref = _pg_show_pref();
	// L'exception impression force l'affichage visuel sans modifier la préférence stockée.
	var show = pref || _pg_is_print_view();
	$(document.body).toggleClass("pg-no-sidebar", !show);
	$(document.body).toggleClass("no-list-sidebar", !show);
	localStorage.setItem("show_sidebar", pref ? "true" : "false");
}

// Bouton toggle formulaire (page.js) : sidebar_wrapper.toggle() + trigger("toggleSidebar")
$(document).on("toggleSidebar", function () {
	var next = !_pg_show_pref();
	localStorage.setItem("pg_show_sidebar", next ? "true" : "false");
	_pg_apply();
});

// Bouton toggle liste (base_list.js) : met à jour localStorage.show_sidebar + trigger("toggleListSidebar")
$(document).on("toggleListSidebar", function () {
	var show = JSON.parse(localStorage.show_sidebar || "true");
	localStorage.setItem("pg_show_sidebar", show ? "true" : "false");
	_pg_apply();
});

$(document).on("page-change", function () {
	_pg_apply();
});

// Supprimer le flash « Espace de Travail » au chargement de la page Workspaces.
// Frappe pose un titre générique (__("Workspace")) via make_app_page (page.js l.119),
// puis le remplace par le nom de la workspace courante (~1 s plus tard via
// workspace.js l.329 : this.page.set_title(__(page.name))). On supprime juste le
// premier : title="" pendant le chargement → rien n'est rendu → puis « Accueil »
// dès que la workspace est résolue.
(function () {
	if (typeof frappe === "undefined") return;
	if (!frappe.standard_pages) frappe.standard_pages = {};

	function wrap_workspaces(original_handler) {
		return function () {
			var orig_make = frappe.ui && frappe.ui.make_app_page;
			if (orig_make) {
				frappe.ui.make_app_page = function (opts) {
					if (opts && opts.name === "Workspaces") {
						opts.title = "";
					}
					frappe.ui.make_app_page = orig_make;
					return orig_make.apply(this, arguments);
				};
			}
			return original_handler.apply(this, arguments);
		};
	}

	if (frappe.standard_pages.Workspaces) {
		frappe.standard_pages.Workspaces = wrap_workspaces(frappe.standard_pages.Workspaces);
	} else {
		var _handler;
		Object.defineProperty(frappe.standard_pages, "Workspaces", {
			configurable: true,
			enumerable: true,
			get: function () {
				return _handler;
			},
			set: function (h) {
				_handler = wrap_workspaces(h);
			},
		});
	}
})();
