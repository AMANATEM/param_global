// Forcer les valeurs par défaut à chaque chargement du bureau
localStorage.setItem("container_fullwidth", "true");
localStorage.setItem("show_sidebar", "false");

// Réappliquer l'état de la sidebar à chaque navigation SPA
$(document).on("page-change", function () {
	var show_sidebar = JSON.parse(localStorage.getItem("show_sidebar") || "true");
	$(document.body).toggleClass("no-list-sidebar", !show_sidebar);
	if (!show_sidebar) {
		$(".page-container .layout-side-section").css("display", "");
	}
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
