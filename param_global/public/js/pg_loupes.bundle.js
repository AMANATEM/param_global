// Moteur de loupes de colonne — UN SEUL exemplaire pour tout le bench.
//
// Le bench impose une loupe de filtrage sur CHAQUE colonne de toute liste
// (cf. le §1 des standards dans CLAUDE.md). Jusqu'au 2026-09-06, chaque app
// recopiait ce moteur dans son propre fichier de liste : **17 exemplaires**.
//
// ⚠️ Ce n'était pas qu'une laideur. Les copies ont divergé, et les corrections
// ne se propageaient pas : quatre listes (Client, Fournisseur, Écriture de
// Stock, Réconciliation de Stock) tournaient encore sur une version sans filtre
// par date ni signalement de saisie invalide, apparus bien plus tard ailleurs.
// C'est le même mécanisme qui avait produit le bug « hafssa » — une liste de
// comptes recopiée cinq fois, avec une faute de frappe dans une seule copie.
//
// Chargé desk-wide par `param_global` : disponible avant tout `*_list.js`,
// donc plus besoin de le déclarer en tête d'un tableau `doctype_list_js`.
//
// ── Utilisation ────────────────────────────────────────────────────────────
//
//     const loupes = frappe.loupes.installer("Commercial", {
//         text: ["name", "nom_commercial"],
//         number: ["coefficient"],
//         check: ["actif"],
//         date: ["date_debut"],
//         status: ["status"],          // colonne Statut de Frappe (docstatus)
//         order_by: "`tabCommercial`.`nom_commercial` asc",
//     });
//     settings.onload = function (listview) {
//         if (typeof previous_onload === "function") previous_onload(listview);
//         loupes(listview);
//     };
//
// Renvoie un `onload` de `listview_settings` — à CHAÎNER derrière celui qui
// existe déjà, jamais à écraser.

frappe.provide("frappe.loupes");

(function () {
	if (frappe.loupes.installer) return;

	const SEARCH_ICON_SVG =
		'<svg width="11" height="11" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
		'<circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.6" fill="none"/>' +
		'<line x1="11" y1="11" x2="14.5" y2="14.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
		"</svg>";

	const COLUMN_SEARCH_CSS = `
		.list-row-col.pg-has-col-search { display: flex; align-items: center; }
		.list-row-col.pg-has-col-search.text-right { justify-content: flex-end; }
		.list-row-col.pg-has-col-search > span:not(.pg-col-search-icon) {
			overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 0 1 auto;
		}
		.list-row-col.pg-has-col-search > .pg-col-search-icon { flex: 0 0 auto; margin-left: 3px; }
		.pg-col-search-icon { display:inline-flex; align-items:center; justify-content:center;
			margin-left:6px; color:var(--text-muted,#8d99a6); cursor:pointer; vertical-align:middle;
			opacity:0.55; transition:opacity 0.15s, color 0.15s; }
		.pg-col-search-icon:hover { opacity:1; }
		.pg-col-search-input-wrap { display:inline-flex; align-items:center; width:calc(100% - 4px);
			background:var(--card-bg,#fff); border:1px solid var(--gray-400,#c0c6cc); border-radius:3px;
			padding:0 4px; height:22px;
			/* ⚠️ transition:none est OBLIGATOIRE, et il lui faut !important : une
			   règle de Frappe pose "transition: all" sur ce genre d'élément. Or
			   Chrome FIGE les animations d'un onglet en arrière-plan — le cadre
			   restait alors bloqué à mi-course (rouge alors que la saisie était
			   redevenue valide, 1,25px au lieu de 2px). Un repère qui ment sur
			   l'état du filtre est pire que pas d'animation du tout.
			   ⚠️ Pas de backtick dans ce commentaire : il vit dans un littéral
			   gabarit JS, un backtick y refermerait la chaîne. */
			transition:none !important; }
		.pg-col-search-input { border:none; outline:none; background:transparent; width:100%;
			font-size:12px; padding:0; color:var(--text-color); }
		.pg-col-search-clear { cursor:pointer; opacity:0.45; padding:0 2px; font-size:16px; line-height:1;
			color:var(--text-muted); }
		.pg-col-search-clear:hover { opacity:1; color:var(--red-500,#e24c4c); }
		/* La colonne FILTRE réellement : cadre vert émeraude appuyé, fond teinté et
		   croix verte. C'est le seul repère qui dise, d'un coup d'œil sur l'en-tête,
		   sur quelles colonnes porte la recherche en cours.
		   ⚠️ AUCUNE transition CSS sur ces trois états : Chrome fige les animations
		   d'un onglet en arrière-plan, et le cadre restait alors bloqué sur une
		   couleur intermédiaire — rouge alors que la saisie était redevenue valide.
		   Un repère qui ment est pire que pas d'animation. */
		.pg-col-search-input-wrap.pg-actif { border:2px solid #0f766e; background:rgba(15,118,110,0.07);
			box-shadow:0 0 0 1px rgba(15,118,110,0.18); padding:0 3px; }
		.pg-col-search-input-wrap.pg-actif .pg-col-search-input { color:#0b5d56; font-weight:600; }
		.pg-col-search-input-wrap.pg-actif .pg-col-search-clear { opacity:0.8; color:#0f766e; }
		/* Zéro résultat, en-tête conservé : Frappe pose un min-height plein écran
		   sur la zone de résultats. Comme on la garde AFFICHÉE pour que les loupes
		   restent atteignables, ce min-height repoussait le message « aucun
		   résultat » ~900 px plus bas, hors de l'écran — on ne voyait qu'un grand
		   vide blanc et on pouvait croire la liste cassée. */
		.result.pg-vide { min-height:0 !important; height:auto !important; }
		.pg-col-search-input-wrap.invalid { border-color:var(--red-500,#e24c4c); }
		.pg-col-search-input-wrap.invalid .pg-col-search-input { color:var(--red-500,#e24c4c); }
	`;

	// ⚠️ Le moteur style la LOUPE, jamais la mise en page de la liste.
	//
	// Une version intermédiaire imposait à toutes les listes la même répartition
	// (bloc de droite à 150px, colonne Titre à flex 2). C'était faux : huit
	// listes utilisaient flex 3.5, le Paiement BL et l'Article ont des colonnes à
	// largeur FIXE avec défilement horizontal, et cinq listes n'avaient aucune
	// règle. Le résultat était une colonne Titre rétrécie ici, une mise en page
	// imposée là où il n'y en avait pas.
	//
	// Chaque liste déclare donc la sienne via `config.mise_en_page`, et rien
	// n'est émis quand elle se tait.
	function css_mise_en_page(doctype, mep) {
		if (!mep) return "";
		const classe = "pg-mep-" + frappe.scrub(doctype).replace(/_/g, "-");
		let css = `.${classe} .level-left { flex: 1 1 0 !important; min-width: 0 !important; }
			.${classe} .list-row-col:last-child { margin-right: 0; }`;
		if (mep.meta_droite) {
			css += `\n.${classe} .level-right { flex: 0 0 ${mep.meta_droite}px !important; }`;
		}
		if (mep.subject_flex) {
			css += `\n.${classe} .list-row-col.list-subject { flex: ${mep.subject_flex} !important; }`;
		}
		const id = "style-" + classe;
		if (!document.getElementById(id)) {
			$("<style id='" + id + "'>")
				.text(css)
				.appendTo("head");
		}
		return classe;
	}

	function inject_column_search_css() {
		if (document.getElementById("pg-col-search-style")) return;
		$("<style id='pg-col-search-style'>").text(COLUMN_SEARCH_CSS).appendTo("head");
	}

	function parse_number_filter(raw) {
		const s = String(raw).trim().replace(/,/g, ".");
		if (!s) return { valid: true, filters: [] };
		const range = s.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/);
		if (range) {
			const min = parseFloat(range[1]);
			const max = parseFloat(range[2]);
			if (isNaN(min) || isNaN(max) || min > max) return { valid: false, filters: [] };
			return { valid: true, filters: [["between", [min, max]]] };
		}
		const op_match = s.match(/^(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
		if (op_match) {
			const val = parseFloat(op_match[2]);
			if (isNaN(val)) return { valid: false, filters: [] };
			let operator = op_match[1];
			if (operator === ">") operator = ">=";
			if (operator === "<") operator = "<=";
			return { valid: true, filters: [[operator, val]] };
		}
		const num_match = s.match(/^(-?\d+)(?:\.(\d+))?$/);
		if (!num_match) return { valid: false, filters: [] };
		if (isNaN(parseFloat(num_match[0]))) return { valid: false, filters: [] };
		// ⚠️ Un nombre seul est un PRÉFIXE, pas un intervalle : « 29 » doit ramener
		// 29, mais aussi 290 et 2 988 — c'est ainsi qu'on cherche un montant dont
		// on ne se rappelle que le début. L'intervalle d'avant (29 → 29,00-29,99)
		// cachait justement 2 988, sans rien signaler.
		//
		// `get_args` en fait un `LIKE '29%'`. MariaDB convertit le DECIMAL en
		// chaîne pour la comparaison (« 2988.000000000 »), donc la partie entière
		// est bien en tête et le préfixe porte dessus. Corollaire assumé : un LIKE
		// n'utilise pas l'index de la colonne — sans conséquence à l'échelle de nos
		// listes, qui ramènent 20 lignes à la fois.
		return { valid: true, filters: [["prefixe", num_match[0]]] };
	}

	// « oui » / « non » (et leurs préfixes) sur une case à cocher.
	const CHECK_OPTIONS = [
		{ label: "oui", value: 1 },
		{ label: "non", value: 0 },
	];

	function parse_check_filter(raw) {
		const s = String(raw).trim().toLowerCase();
		if (!s) return { valid: true, filters: [] };
		const matched = CHECK_OPTIONS.filter((o) => o.label.startsWith(s));
		if (matched.length !== 1) return { valid: false, filters: [] };
		return { valid: true, filters: [["=", matched[0].value]] };
	}

	function _parse_fr_date(s) {
		let m = s.match(/^(\d{1,2})([\/-])(\d{1,2})\2(\d{4})$/);
		if (m) {
			const d = parseInt(m[1], 10);
			const mo = parseInt(m[3], 10);
			const y = parseInt(m[4], 10);
			if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
			const dt = new Date(y, mo - 1, d);
			if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d)
				return null;
			return {
				type: "day",
				iso: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
			};
		}
		// « 20/12 » — jour et mois SANS année. Frappe ne sait pas filtrer un champ
		// Date en `like` : le motif est résolu par un aller-retour serveur, que
		// l'app déclare via `config.resoudre_date_partielle` (voir plus bas).
		m = s.match(/^(\d{1,2})[\/-](\d{1,2})$/);
		if (m) {
			const d = parseInt(m[1], 10);
			const mo = parseInt(m[2], 10);
			if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
			return {
				type: "jour_mois",
				motif: `%-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
			};
		}
		m = s.match(/^(\d{1,2})[\/-](\d{4})$/);
		if (m) {
			const mo = parseInt(m[1], 10);
			const y = parseInt(m[2], 10);
			if (mo < 1 || mo > 12) return null;
			const last_day = new Date(y, mo, 0).getDate();
			return {
				type: "month",
				iso_start: `${y}-${String(mo).padStart(2, "0")}-01`,
				iso_end: `${y}-${String(mo).padStart(2, "0")}-${String(last_day).padStart(
					2,
					"0"
				)}`,
			};
		}
		m = s.match(/^(\d{4})$/);
		if (m) {
			const y = parseInt(m[1], 10);
			return { type: "year", iso_start: `${y}-01-01`, iso_end: `${y}-12-31` };
		}
		// « 12 » — un jour seul, tous mois et toutes années confondus.
		// ⚠️ Testé APRÈS l'année : « 2026 » doit rester une année, pas un jour.
		m = s.match(/^(\d{1,2})$/);
		if (m) {
			const d = parseInt(m[1], 10);
			if (d < 1 || d > 31) return null;
			return { type: "jour_seul", motif: `%-${String(d).padStart(2, "0")}` };
		}
		return null;
	}

	function parse_date_filter(raw) {
		const s = String(raw).trim();
		if (!s) return { valid: true, filters: [] };
		const range_match = s.match(/^(.+?)\s+-\s+(.+)$/);
		if (range_match) {
			const start = _parse_fr_date(range_match[1].trim());
			const end = _parse_fr_date(range_match[2].trim());
			if (!start || !end) return { valid: false, filters: [] };
			// Un motif partiel n'a pas de borne : il ne peut pas servir d'extrémité.
			if (start.motif || end.motif) return { valid: false, filters: [] };
			const start_iso = start.iso || start.iso_start;
			const end_iso = end.iso || end.iso_end;
			if (start_iso > end_iso) return { valid: false, filters: [] };
			return { valid: true, filters: [["between", [start_iso, end_iso]]] };
		}
		const op_match = s.match(/^(>=|<=|>|<)\s*(.+)$/);
		if (op_match) {
			const parsed = _parse_fr_date(op_match[2].trim());
			if (!parsed) return { valid: false, filters: [] };
			if (parsed.motif) return { valid: false, filters: [] };
			let operator = op_match[1];
			if (operator === ">") operator = ">=";
			if (operator === "<") operator = "<=";
			let iso;
			if (parsed.type === "day") iso = parsed.iso;
			else if (operator === ">=") iso = parsed.iso_start;
			else iso = parsed.iso_end;
			return { valid: true, filters: [[operator, iso]] };
		}
		const parsed = _parse_fr_date(s);
		if (!parsed) return { valid: false, filters: [] };
		if (parsed.motif) return { valid: true, filters: [["like", parsed.motif]] };
		if (parsed.type === "day") return { valid: true, filters: [["=", parsed.iso]] };
		return { valid: true, filters: [["between", [parsed.iso_start, parsed.iso_end]]] };
	}

	function parse_column_filter(type, raw) {
		if (type === "number") return parse_number_filter(raw);
		if (type === "check") return parse_check_filter(raw);
		if (type === "date") return parse_date_filter(raw);
		return { valid: true, filters: [] };
	}

	// La colonne Statut de Frappe ne correspond à aucun champ en base : sur un
	// doctype soumissionnable elle reflète `docstatus`. C'est le défaut.
	//
	// ⚠️ Mais tous les doctypes ne sont PAS soumissionnables. Sur Client et
	// Fournisseur, la même colonne reflète `disabled`, avec son vocabulaire à
	// elle (« activé » / « désactivé »). D'où `config.statut`, qui permet de
	// viser un autre champ et d'autres libellés — sans quoi ces deux listes ne
	// pourraient pas utiliser ce moteur.
	//
	// Les accents sont retirés des DEUX côtés : « valide » doit trouver
	// « Validé », personne ne tape l'accent dans une case de filtre.
	// ── Inférence automatique du type d'une colonne non déclarée ──────────
	//
	// Toute colonne affichée reçoit une loupe, sans que l'app ait à la nommer :
	// c'est le `fieldtype` du champ qui décide. Une colonne dont le type ne
	// figure PAS ici n'en reçoit aucune — on ne fabrique jamais un filtre qu'on
	// ne saurait pas honorer.
	//
	// ⚠️ `Datetime` et `Time` sont volontairement ABSENTS. Notre analyse de date
	// produit un `= "2026-12-20"` : sur un Datetime, cette égalité ne trouve que
	// les documents posés à minuit pile, donc quasiment rien — un filtre qui
	// paraît marcher et ment. Une liste qui veut chercher dans un Datetime doit
	// le déclarer elle-même, en connaissance de cause.
	//
	// ⚠️ Les types sans valeur en base (HTML, Image, Bouton, Section, Table…)
	// sont absents pour la même raison : il n'y a rien à filtrer côté SQL.
	const TYPE_PAR_FIELDTYPE = {
		Currency: "number",
		Float: "number",
		Int: "number",
		Percent: "number",
		Date: "date",
		Check: "check",
		Data: "text",
		"Small Text": "text",
		Text: "text",
		"Long Text": "text",
		"Read Only": "text",
		Link: "text",
		"Dynamic Link": "text",
		Select: "text",
		Phone: "text",
		Autocomplete: "text",
		Code: "text",
	};

	const STATUT_PAR_DEFAUT = {
		champ: "docstatus",
		placeholder: "Brouillon  Validé  Annulé",
		options: [
			{ label: "brouillon", valeur: 0 },
			{ label: "validé", valeur: 1 },
			{ label: "annulé", valeur: 2 },
		],
	};

	function sans_accent(texte) {
		return (texte || "")
			.toLowerCase()
			.trim()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "");
	}

	function filtre_statut(val, bareme) {
		const saisie = sans_accent(val);
		if (!saisie) return null;
		const trouves = bareme.options.filter((o) => sans_accent(o.label).startsWith(saisie));
		if (!trouves.length) return null;
		// Plusieurs libellés peuvent désigner la MÊME valeur (« activé »,
		// « actif », « enabled ») : on dédoublonne, sinon un `in` inutile part
		// au serveur avec trois fois la même valeur.
		const valeurs = [...new Set(trouves.map((o) => o.valeur))];
		if (valeurs.length === 1) return ["=", valeurs[0]];
		return ["in", valeurs];
	}

	// `partiel` : cette colonne accepte-t-elle « 20/12 » et « 12 » ? L'exemple ne
	// doit proposer que des formes réellement acceptées, sinon on invite à taper
	// quelque chose qui s'encadrera en rouge.
	function get_search_placeholder(type, bareme, partiel) {
		if (type === "number") return "29  500  >1000  100-500";
		if (type === "check") return "Oui  Non";
		if (type === "date") {
			return partiel ? "20/12/2026  20/12  12/2026  2026  12" : "20/12/2026  12/2026  2026";
		}
		if (type === "status") return bareme.placeholder;
		return "";
	}

	/**
	 * @param {string} doctype
	 * @param {object} config  { text: [], number: [], check: [], date: [], order_by: "" }
	 * @returns {function} un `onload` de listview_settings
	 */
	frappe.loupes.installer = function (doctype, config) {
		const TEXT = new Set(config.text || []);
		const NUMBER = new Set(config.number || []);
		const CHECK = new Set(config.check || []);
		const DATE = new Set(config.date || []);
		const STATUS = new Set(config.status || []);
		// `config.statut` remplace le barème par défaut (docstatus) — cf. plus haut.
		const BAREME_STATUT = Object.assign({}, STATUT_PAR_DEFAUT, config.statut || {});

		// Recherche de date PARTIELLE (« 12 », « 20/12 »). Frappe ne sait pas
		// filtrer un champ Date en `like` : l'app fournit une méthode serveur qui
		// résout un motif en liste de noms de documents — chaque doctype a la
		// sienne (`get_bls_par_date_pattern`, `get_paiements_par_champ_date_pattern`…).
		//
		// Déclarée, elle vaut pour TOUTES les colonnes de date de la liste, le nom
		// de la colonne lui étant passé en second argument : le Paiement BL a trois
		// dates (date, échéance, date de remise) et chacune a son propre résultat.
		//
		// ⚠️ Sans résolveur, les formes partielles sont REFUSÉES (encadré rouge) —
		// le moteur ne fabrique jamais un filtre qu'il ne saurait pas honorer.
		const DATE_PARTIELLE_OK = !!config.resoudre_date_partielle;

		// Recherche TEXTE déléguée au serveur, par colonne.
		// `{ item_name: async (saisie) => noms[] | null }` — renvoyer `null` fait
		// retomber sur le `LIKE %saisie%` ordinaire. Sert à la liste Article, dont
		// la colonne « Nom de l'article » cherche en MULTI-MOTS : les jetons
		// peuvent apparaître dans n'importe quel ordre, ce qu'un LIKE ne sait pas
		// exprimer.
		const RECHERCHE_TEXTE = config.recherche_texte || {};
		const ALL = new Set([...TEXT, ...NUMBER, ...CHECK, ...DATE, ...STATUS]);

		// Inférence automatique : ACTIVE par défaut. `config.auto: false` la coupe
		// pour toute la liste, `config.exclure: [...]` pour quelques colonnes —
		// une colonne calculée à l'affichage, par exemple, qui n'a pas d'équivalent
		// filtrable en base.
		const AUTO = config.auto !== false;
		const EXCLURE = new Set(config.exclure || []);
		// Types devinés au premier rendu, mémorisés pour que `get_field_type` les
		// retrouve ensuite sans avoir la colonne sous la main.
		const TYPE_AUTO = {};

		function get_field_type(fieldname) {
			if (TEXT.has(fieldname)) return "text";
			if (NUMBER.has(fieldname)) return "number";
			if (CHECK.has(fieldname)) return "check";
			if (DATE.has(fieldname)) return "date";
			if (STATUS.has(fieldname)) return "status";
			return TYPE_AUTO[fieldname] || null;
		}

		// Renvoie `true` si la colonne mérite une loupe que l'app n'a pas déclarée.
		function inferer(col, fieldname) {
			if (!AUTO || EXCLURE.has(fieldname)) return false;
			if (TYPE_AUTO[fieldname]) return true;

			// La colonne Statut ne correspond à aucun champ : son barème par
			// défaut est `docstatus`, qui n'a de sens que sur un doctype
			// soumissionnable. Ailleurs (Commercial, Absence…) l'indicateur est
			// maison et l'app DOIT déclarer `config.statut` — sinon on poserait
			// une loupe qui refuserait les mots réellement affichés.
			if (col.type === "Status") {
				if (!config.statut) {
					const meta = frappe.get_meta && frappe.get_meta(doctype);
					if (!meta || !meta.is_submittable) return false;
				}
				TYPE_AUTO[fieldname] = "status";
				return true;
			}

			const df = col.df || {};
			// Un champ virtuel est calculé à la lecture : il n'existe pas en base,
			// aucun filtre SQL ne peut porter dessus.
			if (df.is_virtual) return false;
			const type = TYPE_PAR_FIELDTYPE[df.fieldtype];
			if (!type) return false;
			TYPE_AUTO[fieldname] = type;
			return true;
		}

		return function (listview) {
			inject_column_search_css();
			if (listview.$result) {
				listview.$result.addClass("pg-list");
				const classe_mep = css_mise_en_page(doctype, config.mise_en_page);
				if (classe_mep) listview.$result.addClass(classe_mep);
			}

			const column_filters = {};
			let active_search_field = null;
			let column_search_debounce = null;
			const live_value = {};
			const live_cursor = {};

			// Noms de documents résolus, PAR COLONNE de date.
			// Absent/`null` = aucun motif en cours sur cette colonne. Un tableau
			// vide = motif résolu, mais aucun document ne correspond — ce n'est PAS
			// la même chose, et c'est pourquoi on ne teste jamais la seule longueur.
			let noms_motif_date = {};
			// Noms renvoyés par une recherche texte déléguée (cf. RECHERCHE_TEXTE).
			let noms_recherche_texte = {};

			// `apply_filter_change` est ASYNCHRONE : un motif partiel (« 12 »,
			// « 20/12 ») ne peut pas se traduire en filtre SQL — Frappe ne sait pas
			// filtrer un champ Date en `like` — il faut demander au serveur quels
			// documents correspondent, puis filtrer sur leurs noms.
			async function apply_filter_change(fieldname, val) {
				if (val) column_filters[fieldname] = val;
				else delete column_filters[fieldname];

				if (RECHERCHE_TEXTE[fieldname]) {
					noms_recherche_texte[fieldname] = await RECHERCHE_TEXTE[fieldname](val);
				}

				if (DATE_PARTIELLE_OK && DATE.has(fieldname)) {
					const motif = motif_partiel(val);
					noms_motif_date[fieldname] = motif
						? await config.resoudre_date_partielle(motif, fieldname)
						: null;
				}

				listview.start = 0;
				listview.refresh();
			}

			// ⚠️ Un motif partiel n'est acceptable que sur la colonne pour laquelle
			// l'app a déclaré un résolveur. Ailleurs il doit être REFUSÉ — encadré
			// rouge — et surtout pas produire un filtre que `get_args` ignorerait
			// en silence, ce qui afficherait la liste entière comme si de rien
			// n'était.
			function analyser(type, val, fieldname) {
				const r = parse_column_filter(type, val);
				if (
					r.valid &&
					r.filters.length === 1 &&
					r.filters[0][0] === "like" &&
					!(DATE_PARTIELLE_OK && DATE.has(fieldname))
				) {
					return { valid: false, filters: [] };
				}
				return r;
			}

			// ⚠️ Le cadre vert et le filtre envoyé au serveur doivent dire la MÊME
			// chose. Sans ce point unique, la colonne Statut était le seul type non
			// contrôlé : taper « annule » sur la liste Article — dont le barème est
			// « Activé / Désactivé » — laissait un cadre vert et n'envoyait AUCUN
			// filtre, donc la liste entière s'affichait comme si de rien n'était.
			function saisie_valide(type, val, fieldname) {
				if (!val) return true;
				// Un LIKE est toujours honoré : il peut ne rien ramener, mais il
				// part bel et bien au serveur.
				if (type === "text") return true;
				if (type === "status") return !!filtre_statut(val, BAREME_STATUT);
				return analyser(type, val, fieldname).valid;
			}

			// Renvoie le motif `%-MM-JJ` / `%-JJ` si la saisie en est un, sinon null.
			function motif_partiel(val) {
				if (!val) return null;
				const parsed = parse_date_filter(val);
				if (!parsed.valid) return null;
				if (parsed.filters.length === 1 && parsed.filters[0][0] === "like") {
					return parsed.filters[0][1];
				}
				return null;
			}

			function inject_column_search() {
				const $head = listview.$result
					? $(listview.$result).find(".list-row-head").first()
					: null;
				if (!$head || !$head.length) return;
				const $cols = $head.find(".list-row-col");
				(listview.columns || []).forEach((col, idx) => {
					// La colonne Statut ne correspond à AUCUN champ en base :
					// Frappe la pose avec col.type === "Status". Sans cette
					// détection explicite, elle serait la seule colonne sans
					// loupe — or CLAUDE.md les veut toutes, sans exception.
					const fieldname =
						(col.df && col.df.fieldname) || (col.type === "Status" ? "status" : null);
					if (!fieldname) return;
					if (!ALL.has(fieldname) && !inferer(col, fieldname)) return;
					const $col = $cols.eq(idx);
					if (!$col.length) return;
					// L'en-tête d'origine est mémorisé pour pouvoir être restitué
					// quand la loupe se referme. ⚠️ On en RETIRE d'abord les icônes :
					// si l'en-tête a déjà été décoré (re-rendu, ou icône de filtre
					// posée par Frappe), les mémoriser les figerait dans le HTML
					// « d'origine » et la colonne se retrouverait avec deux loupes.
					if (!$col.data("pg-orig-html")) {
						const $propre = $("<div>").html($col.html());
						$propre.find(".pg-col-search-icon, .col-filter-icon").remove();
						$col.data("pg-orig-html", $propre.html());
					}
					if (column_filters[fieldname] || active_search_field === fieldname) {
						render_search_input($col, fieldname);
					} else {
						render_search_icon($col, fieldname);
					}
				});
			}

			function render_search_icon($col, fieldname) {
				$col.html($col.data("pg-orig-html") || "");
				$col.addClass("pg-has-col-search");
				const $icon = $(
					`<span class="pg-col-search-icon" title="${__(
						"Filtrer"
					)}">${SEARCH_ICON_SVG}</span>`
				);
				$icon.on("click", function (e) {
					e.preventDefault();
					e.stopPropagation();
					active_search_field = fieldname;
					render_search_input($col, fieldname);
				});
				$col.append($icon);
			}

			function render_search_input($col, fieldname) {
				// Réutiliser l'input existant : le recréer défocalise le champ, ce
				// qui referme le clavier virtuel sur mobile à chaque frappe.
				const $existing = $col.find(".pg-col-search-input");
				if ($existing.length) {
					const live = live_value[fieldname];
					if (live !== undefined && $existing.val() !== live) $existing.val(live);
					// L'en-tête est re-rendu à chaque rafraîchissement : sans ce
					// rappel, le cadre vert resterait figé sur l'état d'avant la
					// dernière frappe.
					const etat = $existing.closest(".pg-col-search-input-wrap").data("pg-etat");
					if (typeof etat === "function") etat($existing.val());
					return;
				}

				const type = get_field_type(fieldname);
				const current_val =
					live_value[fieldname] !== undefined
						? live_value[fieldname]
						: column_filters[fieldname] || "";
				const cursor_pos =
					live_cursor[fieldname] !== undefined
						? live_cursor[fieldname]
						: current_val.length;
				const had_focus = active_search_field === fieldname;
				const placeholder = get_search_placeholder(
					type,
					BAREME_STATUT,
					DATE_PARTIELLE_OK && DATE.has(fieldname)
				);
				const placeholder_attr = placeholder
					? ` placeholder="${frappe.utils.escape_html(placeholder)}"`
					: "";
				const $wrap = $(
					`<span class="pg-col-search-input-wrap">` +
						`<input type="text" class="pg-col-search-input" value="${frappe.utils.escape_html(
							current_val
						)}"${placeholder_attr} />` +
						`<span class="pg-col-search-clear" title="${__(
							"Effacer"
						)}">&times;</span>` +
						`</span>`
				);
				$col.removeClass("pg-has-col-search");
				$col.empty().append($wrap);

				const $input = $wrap.find("input");

				// Trois états visuels, et un seul endroit qui les décide :
				//   vide          → cadre gris, la colonne ne filtre rien ;
				//   saisie valide → cadre VERT, la colonne filtre (repère demandé) ;
				//   saisie fausse → cadre rouge, rien ne part au serveur.
				function etat_visuel(val) {
					$wrap.toggleClass("invalid", !!val && !saisie_valide(type, val, fieldname));
					$wrap.toggleClass("pg-actif", !!val && saisie_valide(type, val, fieldname));
				}
				$wrap.data("pg-etat", etat_visuel);
				etat_visuel(current_val);

				if (had_focus) {
					setTimeout(() => {
						$input.focus();
						try {
							if ($input[0].setSelectionRange)
								$input[0].setSelectionRange(cursor_pos, cursor_pos);
						} catch (e) {
							/* noop */
						}
					}, 0);
				}

				$input.on("input", function () {
					const val = $(this).val();
					live_value[fieldname] = val;
					live_cursor[fieldname] = this.selectionStart;
					active_search_field = fieldname;
					etat_visuel(val);
					clearTimeout(column_search_debounce);
					column_search_debounce = setTimeout(
						() => apply_filter_change(fieldname, val),
						250
					);
				});

				$input.on("keydown", function (e) {
					if (e.key === "Escape" || e.keyCode === 27) {
						e.preventDefault();
						e.stopPropagation();
						close_column_search($col, fieldname);
					}
				});

				// Un champ laissé VIDE se referme dès qu'on clique ailleurs, et la
				// loupe revient : sans cela l'en-tête garde une barre de saisie
				// ouverte sur une colonne qui ne filtre rien, et la colonne reste
				// illisible. Un champ qui porte encore du texte, lui, RESTE ouvert
				// — c'est un filtre actif, il doit se voir.
				//
				// ⚠️ Le délai de 150 ms laisse les autres clics (la croix, une
				// autre loupe) se traiter d'abord ; le test de présence dans le
				// document écarte le cas où un re-rendu a déjà remplacé l'input.
				$input.on("blur", function () {
					setTimeout(() => {
						if (!$input[0] || !$.contains(document, $input[0])) return;
						if ($input.val()) return;
						close_column_search($col, fieldname);
					}, 150);
				});

				$wrap.find(".pg-col-search-clear").on("click", function (e) {
					e.preventDefault();
					e.stopPropagation();
					close_column_search($col, fieldname);
				});
			}

			function close_column_search($col, fieldname) {
				const had_filter = !!column_filters[fieldname];
				delete column_filters[fieldname];
				delete live_value[fieldname];
				delete live_cursor[fieldname];
				// Les noms résolus côté serveur appartiennent à la saisie qu'on
				// vient d'abandonner : les garder ferait rejouer un ancien
				// résultat si la colonne était rouverte.
				delete noms_motif_date[fieldname];
				delete noms_recherche_texte[fieldname];
				if (active_search_field === fieldname) active_search_field = null;
				clearTimeout(column_search_debounce);
				render_search_icon($col, fieldname);
				if (had_filter) {
					listview.start = 0;
					listview.refresh();
				}
			}

			const original_render_header = listview.render_header.bind(listview);
			listview.render_header = function (...args) {
				const result = original_render_header(...args);
				setTimeout(() => inject_column_search(), 0);
				return result;
			};

			const original_toggle_result_area = listview.toggle_result_area.bind(listview);
			listview.toggle_result_area = function () {
				const filters_active =
					Object.keys(column_filters).length > 0 || active_search_field !== null;
				const is_empty = !listview.data || listview.data.length === 0;
				if (!(filters_active && is_empty)) {
					listview.$result.removeClass("pg-vide");
					return original_toggle_result_area();
				}

				listview.$result.show().addClass("pg-vide");
				listview.$paging_area.toggle(false);
				listview.$no_result.toggle(true);
				// Le bandeau d'actions groupées suit la sélection, même quand la
				// liste est vide de résultats : sans cet appel il reste affiché
				// avec un compte périmé.
				if (listview.toggle_actions_menu_button) {
					listview.toggle_actions_menu_button(
						listview.$result.find(".list-row-checkbox:checked").length > 0
					);
				}
				if (!listview.$result.find(".list-row-head").length) listview.render_header(true);
				inject_column_search();
				listview.$no_result.html(
					`<div class="no-result text-muted flex justify-center align-center" style="padding:40px 0;">` +
						__("Aucun résultat pour les filtres actifs.") +
						`</div>`
				);
			};

			const original_get_args = listview.get_args.bind(listview);
			listview.get_args = function () {
				const args = original_get_args();
				Object.keys(column_filters).forEach((fn) => {
					const val = column_filters[fn];
					if (!val) return;
					const type = get_field_type(fn);
					// ⚠️ RÈGLE ABSOLUE : une saisie qui ne peut pas être honorée
					// donne ZÉRO résultat, jamais la liste entière. Le cadre rouge
					// dit « je n'ai pas compris » ; si la liste continuait d'afficher
					// tout, elle contredirait le cadre — et c'est exactement ce qui
					// faisait croire à un filtre appliqué (cas « annule » tapé sur la
					// colonne Statut de l'Article, dont le barème est Activé/Désactivé).
					// Cette sentinelle ne peut correspondre à aucun document.
					const AUCUN = [doctype, "name", "in", ["__aucun__"]];
					if (type === "status") {
						const filtre = filtre_statut(val, BAREME_STATUT);
						args.filters.push(
							filtre ? [doctype, BAREME_STATUT.champ, filtre[0], filtre[1]] : AUCUN
						);
						return;
					}
					if (type === "text") {
						const noms = noms_recherche_texte[fn];
						// `null`/absent = la recherche déléguée ne s'applique pas à
						// cette saisie : on retombe sur le LIKE ordinaire.
						if (RECHERCHE_TEXTE[fn] && noms) {
							args.filters.push([
								doctype,
								"name",
								"in",
								noms.length ? noms : ["__aucun__"],
							]);
						} else {
							args.filters.push([doctype, fn, "like", `%${val}%`]);
						}
						return;
					}
					const parsed = analyser(type, val, fn);
					// Nombre ou date que le moteur ne sait pas traduire en filtre :
					// même règle, zéro résultat. « 10a » ne désigne aucun montant.
					if (!parsed.valid) {
						args.filters.push(AUCUN);
						return;
					}
					// Motif partiel : le filtre ne porte pas sur la colonne mais sur
					// les NOMS que le serveur a renvoyés. Une liste vide doit donner
					// zéro résultat, d'où la sentinelle — sans elle, un `in []` est
					// ignoré par Frappe et la liste s'afficherait entière.
					if (parsed.filters.length === 1 && parsed.filters[0][0] === "like") {
						const noms = noms_motif_date[fn];
						// ⚠️ Même règle que pour le statut : on n'affiche JAMAIS la
						// liste entière en laissant croire qu'elle est filtrée. Si
						// la résolution n'a rien donné — aucun document, ou le
						// serveur n'a pas répondu —, la sentinelle force zéro
						// résultat, ce qui se voit, au lieu d'un filtre escamoté.
						args.filters.push([
							doctype,
							"name",
							"in",
							Array.isArray(noms) && noms.length ? noms : ["__aucun__"],
						]);
						return;
					}
					parsed.filters.forEach(([op, v]) => {
						if (op === "prefixe") args.filters.push([doctype, fn, "like", v + "%"]);
						else args.filters.push([doctype, fn, op, v]);
					});
				});
				if (config.order_by && (!listview.sort_by || listview.sort_by === "modified")) {
					args.order_by = config.order_by;
				}
				return args;
			};

			// ── Poignée exposée à l'app ────────────────────────────────────
			//
			// Les listes ont chacune leur règle sur QUAND effacer les filtres
			// (au clic sur ♻️, à une re-navigation, mais pas au retour depuis une
			// fiche…). Cette règle est propre à l'app ; l'état des loupes, lui,
			// vit dans ce moteur. D'où cette poignée : sans elle, les fichiers de
			// liste allaient chercher `column_filters` et `inject_column_search`
			// à l'intérieur du moteur — ce qui est exactement ce qui les avait
			// poussés à en recopier une version entière chacun.
			listview.pg_loupes = {
				// Vide toutes les loupes et redessine l'en-tête.
				// Renvoie `true` s'il y avait effectivement quelque chose à
				// effacer — au chargement initial il n'y a rien, et relancer un
				// `refresh()` pour rien fait clignoter la liste.
				effacer: function () {
					const avait_des_filtres =
						Object.keys(column_filters).length > 0 || active_search_field !== null;
					Object.keys(column_filters).forEach((fn) => delete column_filters[fn]);
					Object.keys(live_value).forEach((fn) => delete live_value[fn]);
					Object.keys(live_cursor).forEach((fn) => delete live_cursor[fn]);
					active_search_field = null;
					noms_motif_date = {};
					noms_recherche_texte = {};
					clearTimeout(column_search_debounce);
					inject_column_search();
					return avait_des_filtres;
				},
				// Redessine l'en-tête sans rien effacer.
				rafraichir: inject_column_search,
			};

			inject_column_search();
		};
	};
})();
