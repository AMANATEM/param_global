frappe.listview_settings["Item"] = frappe.listview_settings["Item"] || {};

(function () {
	const settings = frappe.listview_settings["Item"];
	const prev_onload = settings.onload;

	settings.onload = function (listview) {
		if (typeof prev_onload === "function") prev_onload(listview);

		let _names_cache = null;

		// ── get_args : filtre multi-tokens + tri par défaut ID décroissant ────
		const orig_get_args = listview.get_args.bind(listview);
		listview.get_args = function () {
			const args = orig_get_args();

			if (_names_cache !== null) {
				args.filters = args.filters.filter((f) => f[1] !== "item_name");
				const names = _names_cache.length ? _names_cache : ["__aucun__"];
				args.filters.push(["Item", "name", "in", names]);
			}

			if (!listview.sort_by || listview.sort_by === "modified") {
				args.order_by = "`tabItem`.`name` desc";
			}

			return args;
		};

		// ── Tri par défaut ─────────────────────────────────────────────────────
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

		// ── Recherche multi-tokens sur Nom de l'article ────────────────────────
		function bind_filter() {
			const f = listview.page.fields_dict["item_name"];
			if (!f || !f.$input) return;

			f.$input.off("input.pg_item").on(
				"input.pg_item",
				frappe.utils.debounce(function () {
					const val = (f.get_value() || "").trim();
					const tokens = val.split(/\s+/).filter(Boolean);

					if (tokens.length <= 1) {
						if (_names_cache !== null) {
							_names_cache = null;
							listview.start = 0;
							listview.refresh();
						}
						return;
					}

					frappe.call({
						method: "param_global.api.recherche_article_liste",
						args: { txt: val },
						no_spinner: true,
						callback: function (r) {
							_names_cache = r.message || [];
							listview.start = 0;
							listview.refresh();
						},
					});
				}, 300)
			);
		}

		bind_filter();
	};
})();
