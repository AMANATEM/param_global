// Barre de défilement horizontal TOUJOURS visible sur les listes qui débordent.
//
// Une liste trop large pour l'écran (colonnes à largeur fixe : Paiement BL,
// Article…) défile horizontalement dans son conteneur `.result`. Mais si ce
// conteneur n'a pas de hauteur bornée, il s'étire sur toutes ses lignes et sa
// barre horizontale se retrouve tout en bas — il fallait descendre la page
// entière pour pouvoir faire défiler la liste de côté.
//
// La liste Article le réglait pour elle seule (`max-height` + en-tête collant,
// dans son `item_list.js`) ; le Paiement BL ne l'avait jamais reçu. Plutôt qu'une
// copie de plus dans chaque liste concernée, la règle vit ici, desk-wide :
// TOUTE liste dont le contenu déborde horizontalement voit sa hauteur bornée à
// l'écran — la barre reste en bas de la fenêtre — et son en-tête (loupes
// comprises) reste collé en haut pendant le défilement vertical.
//
// ⚠️ On ne touche à RIEN sur une liste qui ne déborde pas : elle garde le
// défilement de page habituel de Frappe. Le contrôle est refait à chaque rendu,
// à chaque redimensionnement et à chaque navigation.
//
// ⚠️ La hauteur est CALCULÉE (position réelle de la liste, hauteur de la zone
// de pagination) et non un `calc(100vh - Npx)` figé : la barre de filtres, les
// étiquettes et la barre DEV ambre décalent la liste d'une page à l'autre.
//
// ⚠️ Une liste qui borne déjà sa hauteur elle-même (Article) est laissée telle
// quelle : son propre CSS fait foi.

(function () {
	if (window.__pg_defilement_liste) return;
	window.__pg_defilement_liste = true;

	const CLASSE = "pg-defilement-h";
	const HAUTEUR_MINI = 250;
	const MARGE_BAS = 12;

	const CSS = `
		.result.${CLASSE} { overflow: auto !important; min-height: 0 !important; }
		.result.${CLASSE} .list-row-head {
			position: sticky; top: 0; z-index: 3; background-color: var(--subtle-fg);
		}
	`;

	function injecter_css() {
		if (document.getElementById("pg-defilement-liste-style")) return;
		$("<style id='pg-defilement-liste-style'>").text(CSS).appendTo("head");
	}

	function ajuster(listview) {
		const el = listview && listview.$result && listview.$result[0];
		if (!el || !el.isConnected || !el.offsetParent) return;

		const deja_le_notre = el.classList.contains(CLASSE);
		// Liste qui borne déjà sa hauteur par son propre CSS : ne pas s'en mêler.
		if (!deja_le_notre && getComputedStyle(el).maxHeight !== "none") return;

		const deborde = el.scrollWidth > el.clientWidth + 1;
		if (!deborde) {
			if (deja_le_notre) {
				el.classList.remove(CLASSE);
				el.style.maxHeight = "";
			}
			return;
		}

		injecter_css();
		el.classList.add(CLASSE);
		const haut = el.getBoundingClientRect().top + window.scrollY;
		const pagination =
			listview.$paging_area && listview.$paging_area.is(":visible")
				? listview.$paging_area.outerHeight(true)
				: 0;
		const hauteur = Math.max(
			HAUTEUR_MINI,
			Math.floor(window.innerHeight - haut - pagination - MARGE_BAS),
		);
		el.style.maxHeight = hauteur + "px";
	}

	function ajuster_plus_tard(listview) {
		// setTimeout et non requestAnimationFrame : le rendu des lignes et des
		// loupes se termine juste après `render()`.
		setTimeout(() => ajuster(listview), 0);
	}

	function ajuster_liste_courante() {
		const lv = window.cur_list;
		if (lv && lv.$result) ajuster_plus_tard(lv);
	}

	function installer() {
		const LV = frappe.views && frappe.views.ListView;
		if (!LV || LV.prototype.__pg_defilement_patch) return !!LV;
		LV.prototype.__pg_defilement_patch = true;

		for (const methode of ["render", "render_header"]) {
			const origine = LV.prototype[methode];
			if (typeof origine !== "function") continue;
			LV.prototype[methode] = function () {
				const resultat = origine.apply(this, arguments);
				ajuster_plus_tard(this);
				return resultat;
			};
		}
		return true;
	}

	if (!installer()) $(document).on("app_ready", installer);

	let minuterie = null;
	$(window).on("resize", () => {
		clearTimeout(minuterie);
		minuterie = setTimeout(ajuster_liste_courante, 100);
	});
	$(document).on("page-change", ajuster_liste_courante);
})();
