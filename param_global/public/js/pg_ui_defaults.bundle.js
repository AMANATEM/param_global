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
	_pg_patch_affichage_montants();

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

// ─── Affichage des montants en saisie : 2 décimales, pas 4 ─────────────────
// Nos champs prix (`rate`, `amount`, `prix_ht`…) portent un Property Setter
// `precision = 4`, posé volontairement par bon_livraison/bon_reception : Omag
// stocke des prix unitaires à 4 décimales (câble à 1,296 DH, boulonnerie à
// 0,288 DH) et arrondir à 2 déplacerait jusqu'à 7,20 DH sur une seule ligne,
// pour une tolérance de réconciliation Omag de 0,02 DH. Cette précision doit
// donc rester à 4.
//
// Mais `precision` sert à la fois au calcul ET à l'affichage dans l'input :
// `ControlCurrency.get_precision()` renvoie `df.precision`, utilisé par
// `parse()` (arrondi de la saisie) et par `format_for_input()` (ce qu'on voit).
// D'où « 40,0000 » en saisie qui redevient « 40,00 » à la validation.
//
// On ne redéfinit QUE `format_for_input`, qui n'est utilisé que pour remplir
// l'input (data.js : `$input.val(this.format_for_input(value))`). Ni `parse()`,
// ni le stockage, ni le calcul ne sont touchés : aucun risque sur les données.
// Résultat : 40 → « 40,00 », 135 → « 135,00 », mais 1,296 reste « 1,296 ».
// On affiche le minimum utile, jamais des zéros de remplissage.
const PG_DECIMALES_MINI = 2;

function _pg_patch_affichage_montants() {
	const C = frappe.ui && frappe.ui.form && frappe.ui.form.ControlCurrency;
	if (!C || C.prototype._pg_format_patche) return;

	C.prototype.format_for_input = function (value) {
		if (value === null || value === undefined || isNaN(Number(value))) return "";

		const precision_champ = this.get_precision();
		const valeur = flt(value, precision_champ);

		// Décimales réellement significatives, plancher à 2, plafond à la précision du champ.
		let decimales = PG_DECIMALES_MINI;
		const texte = String(valeur);
		const point = texte.indexOf(".");
		if (point > -1) {
			decimales = Math.min(precision_champ, Math.max(PG_DECIMALES_MINI, texte.length - point - 1));
		}

		return format_number(valeur, this.get_number_format(), decimales);
	};
	C.prototype._pg_format_patche = true;
}

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

// ── Listes : ne jamais restaurer les filtres d'une visite précédente ─────────
//
// Frappe mémorise les filtres de chaque liste par utilisateur dans
// `__UserSettings` et les rejoue à l'ouverture (list_view.js::setup_defaults,
// branche « Priority 1: view_user_settings »). Conséquence : on actualise la
// page et la liste revient filtrée comme on l'avait laissée — comportement
// signalé comme gênant sur les listes Client et Fournisseur, alors que la liste
// des Bons de Livraison, elle, s'ouvre toujours propre.
//
// On uniformise ici pour TOUTES les listes de TOUTES les apps : on retire les
// filtres sauvegardés avant que Frappe ne les lise, ce qui le fait retomber sur
// la « Priority 2 » — les filtres par défaut déclarés par l'app dans ses
// `listview_settings`. Ces défauts métier (ex. masquer les articles désactivés)
// restent donc appliqués : on n'efface que ce que l'utilisateur avait posé.
//
// ⚠️ On ne touche PAS à `frappe.route_options` : c'est le canal par lequel un
// lien ouvre une liste déjà filtrée (« voir les BL de ce client »). Le neutraliser
// casserait cette navigation. Il est de toute façon vide après une actualisation,
// puisqu'il ne vit qu'en mémoire.
// ⚠️ Le point d'accroche est `BaseList.setup_defaults`, PAS celui de ListView.
// `this.user_settings` n'existe qu'à partir de `BaseList.setup_defaults()` (elle
// y fait `this.user_settings = frappe.get_user_settings(this.doctype)`), et le
// getter `view_user_settings` le déréférence sans garde. S'accrocher AVANT
// `ListView.setup_defaults` — donc avant son `super.setup_defaults()` — lève
// « Cannot read properties of undefined (reading 'List') » et **vide toutes les
// listes du desk** (constaté le 2026-08-06). On enveloppe donc BaseList et on
// supprime APRÈS l'appel original : ListView lit les filtres juste ensuite,
// dans la foulée de son `super`.
(function () {
	function pg_sans_filtres_memorises() {
		if (!frappe.views || !frappe.views.BaseList) return false;
		const proto = frappe.views.BaseList.prototype;
		if (proto.pg_filtres_non_restaures) return true;

		const original = proto.setup_defaults;
		proto.setup_defaults = function () {
			const retour = original.apply(this, arguments);
			// Filet : ce patch est du confort d'affichage. Quoi qu'il arrive ici,
			// il ne doit jamais empêcher une liste de s'afficher.
			try {
				const vus = this.user_settings && this.user_settings[this.view_name];
				if (vus && Array.isArray(vus.filters)) {
					delete vus.filters;
				}
			} catch (e) {
				console.warn("param_global : filtres mémorisés non effacés", e);
			}
			return retour;
		};
		proto.pg_filtres_non_restaures = true;
		return true;
	}

	// BaseList peut ne pas être encore chargée au moment où ce bundle s'exécute
	// (list.bundle.js est chargé à la demande) : on retente à chaque navigation
	// tant que le patch n'a pas pu être posé.
	if (!pg_sans_filtres_memorises()) {
		$(document).on("page-change", pg_sans_filtres_memorises);
	}
})();
