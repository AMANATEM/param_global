// Tri de la liste de recherche d'article par clic sur le titre d'une colonne.
//
// La liste déroulante des articles (CODE · DÉSIGNATION · PRIX VENTE · GARAGE ·
// DEPOT · DERN. ACHAT) arrive dans l'ordre du serveur, c'est-à-dire par code.
// Chercher « le moins cher » ou « celui qui reste en stock au garage » obligeait à
// parcourir la liste à l'œil. Un clic sur le titre trie désormais la colonne :
// 1er clic DESCENDANT, 2e ASCENDANT, avec la flèche affichée dans le titre.
//
// POSÉ ICI, DESK-WIDE, ET NON DANS CHAQUE APP — le même dropdown est dupliqué
// SEPT fois (Bon de Livraison, Retour, Devis, Bon de Commande, Bon de Réception,
// Écriture de Stock, Réconciliation de Stock), à chaque fois avec son propre
// préfixe de classe (`bl-`, `retour-`, `devis-`, `bc-`, `br-`, `es-`, `rs-`) mais
// toujours la même structure : un en-tête de N `<span>` au-dessus, et dans chaque
// ligne un `<div class="…-item-row">` de N `<span>` dans le MÊME ordre. On trie
// donc sur l'indice de colonne, sans rien savoir du domaine.
//
// LE TRI PART AU SERVEUR, ET SE REJOUE SUR LE DOM. Deux étages, pour deux
// raisons différentes :
//
//   1. `pg_tri` est glissé dans les filtres de la requête et la recherche est
//      relancée. Le `ORDER BY` se fait alors en SQL, AVANT le `LIMIT` : le
//      classement porte sur TOUT le catalogue filtré, pas sur la page affichée.
//      C'est ce qui rend la réponse juste — « les articles en stock au garage »
//      sur une recherche qui en compte 255 ne peut pas se déduire des 50
//      premiers codes. Voir `param_global/recherche_articles.py`.
//
//      ⚠️ CETTE RELANCE EST FAITE À LA MAIN, ET SURTOUT PAS PAR UN
//      `$input.trigger("input")`. Repasser par le chemin de Frappe faisait
//      CLIGNOTER la liste une bonne seconde, mesuré au MutationObserver :
//
//          34 ms   tri local                 0 0 0 0 0     (correct)
//        1426 ms   awesomplete-open          · · · · ·     (lignes pas enrichies)
//        1436 ms   re-rendu                  0 0 0 26 60   (la liste EN CACHE !)
//        1460 ms   re-rendu                  0 0 0 0 0     (réponse du serveur)
//
//      link.js debounce la frappe de 500 ms puis, si le terme est en cache,
//      REPOSE d'abord la liste mémorisée — dans son ordre d'origine — avant
//      d'aller chercher la vraie. L'œil voit donc le tri, puis son contraire,
//      puis le tri. En appelant nous-mêmes, il ne reste qu'un seul rendu, à
//      ~150 ms au lieu de ~1 400.
//   2. Le DOM est réordonné dans la foulée, sans attendre le serveur : la liste
//      bascule sous le doigt au lieu de sauter une demi-seconde plus tard. Ce
//      classement local reste aussi le filet de sécurité pour un dropdown dont
//      le serveur ne saurait pas trier (libellé de colonne inconnu).
//
// Réordonner le DOM est sans risque : chaque option garde ses propres données
// attachées, les déplacer ne dissocie jamais une ligne de son article.
//
// MÉMORISÉ PAR LIBELLÉ DE COLONNE, PAS PAR INDICE — l'en-tête est recréé pour
// chaque champ Article (un par ligne de grille), et le tri doit survivre aux
// rendus successifs d'une même recherche. Retenir « PRIX VENTE, descendant »
// plutôt que « colonne 2 » permet en prime de retomber sur ses pieds entre apps :
// l'Écriture de Stock n'a que 5 colonnes, dans un autre ordre.
//
// LE TRI NE VAUT QUE POUR LA RECHERCHE EN COURS. Il est retenu avec le TERME sur
// lequel on a cliqué : effacer le champ et chercher un autre article le remet à
// zéro, flèche comprise. Sans cela, un classement par stock décidé pour « tube »
// restait silencieusement en vigueur sur toutes les recherches suivantes de la
// session — et sur toutes les lignes du document.
//
// ⚠️ `mousedown` est neutralisé sur l'en-tête : sans cela, le clic sortirait le
// curseur du champ de saisie, awesomplete refermerait le dropdown, et le tri
// n'aurait plus rien à trier.
//
// ⚠️ Le surlignage clavier est remis à zéro après un tri : `aw.index` désigne un
// RANG dans la liste, qui ne pointe plus sur la même ligne une fois l'ordre
// changé. Remis à -1, Entrée retombe sur le 1er résultat — c'est le repli déjà
// prévu par la navigation des apps.

frappe.provide("param_global.tri_dropdown");

param_global.tri_dropdown = {
	// Les sept en-têtes, reconnus à leur suffixe de classe commun.
	SELECTEUR_ENTETE: 'div[class*="-item-header"]',
	SELECTEUR_CELLULE: 'div[class*="-item-row"] > span',

	FLECHES: { desc: " ▼", asc: " ▲" },

	// Tri courant, partagé par tous les dropdowns : { libelle, sens } ou null.
	_tri: null,
	_css_pose: false,

	setup() {
		if (this._pose) return;
		this._pose = true;
		const self = this;

		this._poser_css();
		if (!this._patcher_requete()) {
			$(() => this._patcher_requete());
		}

		// Garder le curseur dans le champ : un blur refermerait le dropdown.
		$(document).on("mousedown.pg_tri", this.SELECTEUR_ENTETE, (e) => e.preventDefault());

		$(document).on("click.pg_tri", `${this.SELECTEUR_ENTETE} > span`, function (e) {
			e.preventDefault();
			e.stopPropagation();
			self._clic(this);
		});

		// Chaque ouverture reconstruit les lignes : on réapplique le tri retenu.
		// `setTimeout` pour passer APRÈS les gestionnaires des apps, qui remplissent
		// les lignes dans ce même événement.
		$(document).on("awesomplete-open.pg_tri", (e) => {
			if (!self._tri) return;
			const controle = ($(e.target).closest(".frappe-control")[0] || {}).fieldobj;
			const aw = controle && controle.awesomplete;
			if (!aw || !aw.ul) return;

			// Nouvelle recherche = tri caduc. Le dropdown se rouvre à chaque frappe,
			// c'est donc ici qu'on s'en aperçoit, sans écouter le clavier.
			if (self._terme(controle) !== self._tri.terme) {
				self._oublier(aw.ul);
				return;
			}
			setTimeout(() => self._appliquer(aw.ul), 0);
		});
	},

	// Glisse le tri courant dans les filtres de la recherche. `set_custom_query`
	// est le dernier point de passage avant l'appel serveur, donc le seul endroit
	// qui voit les args complets, quelle que soit la façon dont l'app a défini son
	// `get_query` (objet, chaîne ou fonction).
	_patcher_requete() {
		const ControlLink = frappe.ui && frappe.ui.form && frappe.ui.form.ControlLink;
		if (!ControlLink) return false;
		if (ControlLink.prototype._pg_tri_patche) return true;

		const natif = ControlLink.prototype.set_custom_query;
		if (typeof natif !== "function") {
			// ⚠️ FRAGILITÉ CONNUE, même nature que pg_link_search : on greffe sur une
			// méthode interne de Frappe. Renommée par une montée de version, le tri
			// retomberait EN SILENCE sur le classement local des 50 lignes affichées
			// — juste en apparence, faux sur le fond. D'où l'avertissement.
			console.warn(
				"[param_global] ControlLink.set_custom_query est absent : le tri des " +
					"listes d'articles ne portera plus que sur les lignes affichées. " +
					"Vérifier link.js après la dernière montée de version de Frappe."
			);
			return false;
		}

		const self = this;
		ControlLink.prototype.set_custom_query = function (args) {
			natif.call(this, args);
			if (!self._tri) return;
			// Le terme a changé depuis le clic : la requête part sans tri, et
			// `awesomplete-open` effacera la flèche au retour.
			if (String(args.txt || "") !== self._tri.terme) return;
			// Seules nos recherches d'article savent lire `pg_tri` ; les autres
			// champs Link du desk ne doivent rien recevoir.
			if (!JSON.stringify(args.query || "").includes("recherche_article")) return;
			args.filters = Object.assign({}, args.filters, {
				pg_tri: { colonne: self._tri.libelle, sens: self._tri.sens },
			});
		};

		ControlLink.prototype._pg_tri_patche = true;
		return true;
	},

	_poser_css() {
		if (this._css_pose) return;
		this._css_pose = true;
		// Les apps posent `pointer-events: none` sur leur en-tête (simple bandeau
		// décoratif à l'origine) : il faut le rendre cliquable pour trier.
		$("<style id='pg-tri-dropdown-style'>")
			.text(
				`
			${this.SELECTEUR_ENTETE} { pointer-events: auto !important; }
			${this.SELECTEUR_ENTETE} > span { cursor: pointer; user-select: none; }
			${this.SELECTEUR_ENTETE} > span:hover { text-decoration: underline; }
		`
			)
			.appendTo("head");
	},

	_clic(span) {
		const entete = span.parentNode;
		const libelle = this._libelle(span);
		const meme_colonne = this._tri && this._tri.libelle === libelle;

		const controle = ($(entete.parentNode).closest(".frappe-control")[0] || {}).fieldobj;

		// 1er clic sur une colonne : descendant. Re-clic : on bascule.
		this._tri = {
			libelle,
			sens: meme_colonne && this._tri.sens === "desc" ? "asc" : "desc",
			terme: this._terme(controle),
		};

		const ul = entete.parentNode && entete.parentNode.querySelector("ul");
		if (ul) this._appliquer(ul);

		// Puis on redemande la liste au serveur, cette fois triée sur l'ensemble
		// du catalogue. Le classement local ci-dessus n'aura servi qu'à donner la
		// réponse immédiate, le temps de l'aller-retour.
		this._relancer(controle);
	},

	// Redemande la liste au serveur pour le tri courant, sans passer par le
	// gestionnaire de frappe de link.js (cf. l'encadré sur le clignotement).
	_relancer(controle) {
		if (!controle || !controle.$input || !controle.awesomplete) return;
		const doctype = controle.get_options && controle.get_options();
		if (!doctype) return;
		const terme = controle.$input.val();

		const args = {
			txt: terme,
			doctype,
			reference_doctype:
				(controle.get_reference_doctype && controle.get_reference_doctype()) || "",
			page_length:
				cint(
					frappe.boot.sysdefaults && frappe.boot.sysdefaults.link_field_results_limit
				) || 10,
		};
		// C'est ce passage qui pose `query`, `filters` — et notre `pg_tri`, via le
		// patch de set_custom_query.
		controle.set_custom_query(args);
		if (!JSON.stringify(args.query || "").includes("recherche_article")) return;

		frappe.call({
			type: "POST",
			method: "frappe.desk.search.search_link",
			no_spinner: true,
			args,
			callback: (r) => {
				// Le curseur est reparti ailleurs entre-temps : la liste ne nous
				// appartient plus, on ne la réécrit pas.
				if (!controle.$input.is(":focus")) return;
				const aw = controle.awesomplete;
				let resultats = r.message || [];
				if (controle.merge_duplicates) resultats = controle.merge_duplicates(resultats);

				// « Créer un article » / « Recherche avancée » sont ajoutés par
				// link.js dans SON callback, que l'on court-circuite ici : on les
				// reprend de la liste en place, sinon ils disparaîtraient du
				// dropdown dès le premier tri.
				const actions = (aw._list || []).filter((item) =>
					String((item && item.value) || "").endsWith("__link_option")
				);
				const liste = resultats.concat(actions);

				// Le cache de link.js est indexé par terme, pas par tri : sans cette
				// mise à jour, la frappe suivante ressortirait l'ordre d'avant.
				if (controle.$input.cache && controle.$input.cache[doctype]) {
					controle.$input.cache[doctype][terme] = liste;
				}
				aw.list = liste;
			},
		});
	},

	_terme(controle) {
		return controle && controle.$input ? String(controle.$input.val() || "") : null;
	},

	// Abandonne le tri courant et rend à l'en-tête ses titres nus.
	_oublier(ul) {
		this._tri = null;
		const entete = ul.parentNode && ul.parentNode.querySelector(this.SELECTEUR_ENTETE);
		if (!entete) return;
		Array.from(entete.children).forEach((span) => {
			span.textContent = this._libelle(span);
		});
	},

	// Libellé d'origine du titre, mémorisé avant qu'on y ajoute une flèche.
	_libelle(span) {
		if (!span.dataset.pgLibelle) span.dataset.pgLibelle = span.textContent.trim();
		return span.dataset.pgLibelle;
	},

	_appliquer(ul) {
		const entete = ul.parentNode && ul.parentNode.querySelector(this.SELECTEUR_ENTETE);
		if (!entete || !this._tri) return;

		const titres = Array.from(entete.children);
		const indice = titres.findIndex((s) => this._libelle(s) === this._tri.libelle);
		this._marquer(titres, indice);
		if (indice === -1) return;

		// « Créer un article » / « Recherche avancée » restent en fin de liste :
		// ce sont des actions, pas des résultats.
		const lignes = [];
		const actions = [];
		// ⚠️ `[role="option"]` SANS NOM DE BALISE : Frappe rend les options du
		// dropdown en `<div role="option">`, pas en `<li>` — un sélecteur `li[...]`
		// ne trouve donc RIEN, et le tri s'exécutait sur une liste vide (la flèche
		// s'affichait, l'ordre ne bougeait pas). Les apps, elles, utilisent
		// `$(aw.ul).children('[role="option"]')`, indifférent à la balise.
		ul.querySelectorAll('[role="option"]').forEach((li) => {
			const valeur = ($(li).data("item.autocomplete") || {}).value;
			if (valeur && String(valeur).endsWith("__link_option")) actions.push(li);
			else lignes.push(li);
		});
		if (lignes.length < 2) return;

		const cles = new Map(lignes.map((li) => [li, this._cellule(li, indice)]));
		const numerique = Array.from(cles.values()).every(
			(v) => v === "" || !isNaN(this._nombre(v))
		);
		const facteur = this._tri.sens === "desc" ? -1 : 1;

		lignes.sort((a, b) => {
			const va = cles.get(a);
			const vb = cles.get(b);
			// Une ligne sans valeur (résultat non enrichi) part toujours en fin,
			// dans les deux sens : elle n'a rien à comparer.
			if (va === "" || vb === "") return va === vb ? 0 : va === "" ? 1 : -1;
			if (numerique) return facteur * (this._nombre(va) - this._nombre(vb));
			return (
				facteur * va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" })
			);
		});

		// Réordonner, c'est déplacer chaque nœud : inutile — et un reflow de plus —
		// quand la liste arrive déjà triée du serveur, ce qui est le cas courant.
		const attendu = lignes.concat(actions);
		const actuel = Array.from(ul.querySelectorAll('[role="option"]'));
		if (attendu.every((li, i) => li === actuel[i])) return;

		attendu.forEach((li) => ul.appendChild(li));
		ul.scrollTop = 0;

		// L'ordre a changé : le rang surligné ne désigne plus la même ligne.
		const controle = ($(ul).closest(".frappe-control")[0] || {}).fieldobj;
		if (controle && controle.awesomplete) controle.awesomplete.goto(-1);
	},

	_marquer(titres, indice) {
		titres.forEach((span, i) => {
			const base = this._libelle(span);
			span.textContent = i === indice ? base + this.FLECHES[this._tri.sens] : base;
		});
	},

	_cellule(li, indice) {
		const cellules = li.querySelectorAll(this.SELECTEUR_CELLULE);
		return cellules[indice] ? cellules[indice].textContent.trim() : "";
	},

	// Texte d'une cellule → nombre. NaN si ce n'en est pas un.
	//
	// ⚠️ DEUX ÉCRITURES COHABITENT DANS LE MÊME DROPDOWN, et les confondre donne
	// un tri faux sans rien casser d'apparent :
	//
	//   • Les montants passent par `format_currency` → format français, séparateur
	//     de milliers « . » et décimale « , » : « 1.292,60 ».
	//   • Les stocks sont écrits à la main par les apps en `toFixed(0)` /
	//     `toFixed(2)` → décimale « . » et AUCUN séparateur de milliers :
	//     « 1476.50 », « 1057 ».
	//
	// Retirer aveuglément les points — ce que faisait la 1re version — lisait donc
	// « 1476.50 » comme 147 650, et un stock à deux décimales passait devant un
	// stock de mille unités. Constaté en vrai, après un tri Garage ▼ :
	// 1476,50 · 967,50 · 749,50 au lieu de 1476,50 · 1057 · 1050.
	//
	// Départage, sans ambiguïté sur nos deux écritures : une virgule présente ⇒
	// format français, le point est un séparateur de milliers. Sinon, un point
	// suivi d'exactement TROIS chiffres est un séparateur de milliers (« 1.057 »),
	// suivi d'un ou deux c'est une décimale (« 1476.50 ») — un `toFixed` n'insère
	// jamais de séparateur de milliers.
	_nombre(texte) {
		let brut = String(texte).replace(/[\s  ]/g, "");
		if (brut.includes(",")) {
			brut = brut.replace(/\./g, "").replace(",", ".");
		} else {
			brut = brut.replace(/\.(?=\d{3}(?:\D|$))/g, "");
		}
		return /^-?\d+(\.\d+)?$/.test(brut) ? parseFloat(brut) : NaN;
	},
};

param_global.tri_dropdown.setup();
