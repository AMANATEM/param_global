frappe.listview_settings["Item"] = frappe.listview_settings["Item"] || {};

(function () {
	const settings = frappe.listview_settings["Item"];
	const prev_onload = settings.onload;

	settings.onload = function (listview) {
		if (typeof prev_onload === "function") prev_onload(listview);

		// ── Tri par défaut : ID décroissant ────────────────────────────────────
		// La recherche par colonne (y compris le multi-mots sur le Nom) est gérée
		// par article/item_list.js — ici on ne s'occupe QUE du tri global.
		const orig_get_args = listview.get_args.bind(listview);
		listview.get_args = function () {
			const args = orig_get_args();
			if (!listview.sort_by || listview.sort_by === "modified") {
				args.order_by = "`tabItem`.`name` desc";
			}
			return args;
		};

		function reset_sort() {
			listview.sort_by = "modified";
			listview.sort_order = "desc";
			if (listview.sort_selector) {
				listview.sort_selector.set_value("modified", "desc");
			}
		}

		function manual_refresh() {
			reset_sort();
			listview.refresh();
		}

		reset_sort();

		// ── Bouton Refresh desktop ─────────────────────────────────────────────
		if (listview.refresh_button) {
			listview.refresh_button.off("click").on("click", function () {
				manual_refresh();
			});
		}

		// ── Item de menu Refresh mobile ────────────────────────────────────────
		const $menu = listview.page && listview.page.menu;
		if ($menu) {
			const refresh_label = __("Refresh");
			const $refresh_link = $menu
				.find(".menu-item-label")
				.filter(function () {
					return $(this).text().trim() === refresh_label;
				})
				.closest("a");
			if ($refresh_link.length) {
				$refresh_link.off("click").on("click", function () {
					manual_refresh();
					return false;
				});
			}
		}

		// ── Reset au tri par défaut à chaque navigation vers la liste Article ──
		$(document).off("page-change.item_sort").on("page-change.item_sort", function () {
			if (frappe.get_route_str() === "List/Item/List") {
				manual_refresh();
			}
		});
	};
})();
