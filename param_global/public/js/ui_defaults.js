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
