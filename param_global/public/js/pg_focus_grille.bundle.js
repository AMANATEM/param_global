// Le curseur arrive TOUJOURS, et il arrive vite.
//
// PROBLÈME — la navigation clavier des grilles (Client → Article, puis Article →
// Quantité → Prix → ligne suivante) déplace le curseur par une cascade de
// `setTimeout` en boucle OUVERTE : on programme un `focus()` à l'aveugle, et
// personne ne vérifie jamais qu'il a atterri.
//
//     customer: function (frm) {
//         setTimeout(() => focusOnInlineItemCode(frm), 500);   // pari sur la latence
//     }
//
// Ce pari se perd en production multi-postes. Choisir un client déclenche
// `get_party_details` côté serveur ; au retour, ERPNext pose la liste de prix et
// les taxes, puis `refresh_field("items")` — et la grille est RECONSTRUITE, les
// `<input>` détruits. Si cet aller-retour dépasse le délai programmé, on
// focalise un champ qui meurt une fraction de seconde plus tard : le focus
// retombe sur `<body>`, et l'utilisateur voit un curseur « resté sur le Client ».
// Invisible sur un poste seul, fréquent dès que le serveur répond moins vite.
//
// Allonger le délai ne corrige rien : c'est le pari lui-même qui est faux.
//
// CORRECTIF — on ne programme plus un focus, on DÉCLARE UNE INTENTION, et ce
// moteur la maintient jusqu'à ce qu'elle soit RÉELLEMENT satisfaite :
//
//  1. Boucle `requestAnimationFrame` (~16 ms) au lieu de la cascade de délais :
//     le curseur part dès que le DOM est prêt, sans attendre un pire cas.
//  2. `MutationObserver` sur la grille : un re-rendu ré-arme l'intention au lieu
//     de l'emporter. Peu importe que le serveur réponde en 200 ms ou en 4 s.
//  3. Critère d'arrivée VÉRIFIÉ : atteint seulement si `document.activeElement`
//     est bien la cible pendant FRAMES_STABLES frames SANS mutation entre-temps.
//     Un focus posé puis balayé n'est plus jamais compté comme un succès.
//  4. Cicatrisation automatique : même sans intention déclarée, un champ de
//     grille qui perd le curseur parce qu'il vient d'être détruit le récupère.
//     C'est ce volet qui couvre les SEPT grilles du bench sans toucher à leur
//     code — BL, Retour, Devis, BC, BR, Écriture de Stock, Réconciliation.
//  5. Le geste de l'utilisateur prime TOUJOURS : un clic ailleurs, Échap ou Tab
//     abandonnent la reconquête. On ne vole jamais le curseur à quelqu'un qui a
//     décidé autre chose.
//  6. Une seule intention vivante (jeton de génération) : une nouvelle demande
//     annule la précédente. Fini les `setTimeout` concurrents qui se marchent
//     dessus et se disputent le curseur.
//  7. L'échec n'est plus silencieux : passé l'échéance, une trace console dit ce
//     qui était visé, ce qui a le focus à la place, et combien de re-rendus sont
//     passés. Un « ça arrive parfois » devient diagnosticable.
//
// ⚠️ ON N'OUVRE PAS LA LIGNE PAR UN CLIC. `grid_row.activate()` est l'API
// synchrone de Frappe et fait exactement le travail (`toggle_editable_row(true)`
// → `make_control`). Un `$cell.click()`, lui, retombe dans la branche `else` de
// `grid_row.js` quand la grille n'est pas encore éditable — `toggle_view()` →
// `show_form()` → `frappe.dom.freeze()`, soit tout l'écran derrière un voile
// blanc. `activate()` porte le même garde-fou en interne et ne risque rien.
//
// ⚠️ LE CONTRÔLE FRAPPE N'EST PAS TOUJOURS L'INPUT DU DOM. Le Bon de Livraison
// remplace l'input du Code article par un clone pour ses lignes manuelles :
// `on_grid_fields_dict.item_code.$input` pointe alors sur un nœud DÉTACHÉ. D'où
// le `document.contains()` avant de s'y fier, et le repli par requête DOM.

frappe.provide("param_global.focus_grille");

param_global.focus_grille = {
	// Au-delà, on renonce et on trace. Large : mieux vaut un curseur qui arrive
	// tard qu'un curseur qui n'arrive pas. En pratique on est sous les 60 ms.
	ECHEANCE_MS: 6000,

	// Plafond de vie ABSOLU, jamais gelé, mesuré à la montre du mur. Sans lui, le
	// gel de l'échéance en arrière-plan (voir `_tour`) rendait une intention
	// impossible à satisfaire ÉTERNELLE : elle tournait indéfiniment dans un
	// onglet caché, sans jamais atteindre son échéance ni rendre la main.
	PLAFOND_ABSOLU_MS: 60000,

	// Cadence de la boucle quand l'onglet est caché. Rien n'y est visible et le
	// navigateur bride de toute façon les timers : inutile d'y brûler du CPU
	// toutes les 16 ms.
	PERIODE_CACHE_MS: 250,

	// Un champ détruit au-delà de ce délai depuis sa dernière prise de focus
	// n'est plus reconquis : la transition attendue n'a pas eu lieu, reposer le
	// curseur si tard le mettrait sur un écran que l'utilisateur a quitté.
	FENETRE_CICATRISATION_MS: 3000,

	// Frames consécutives sans mutation avant de déclarer l'objectif atteint.
	// Une seule ne suffit pas : le re-rendu arrive souvent juste après le focus.
	FRAMES_STABLES: 3,

	// Cadence des tentatives d'ouverture de ligne. Inutile de rappeler
	// `activate()` à chaque frame tant que la grille n'est pas éditable.
	PERIODE_ACTIVATION_MS: 50,

	_generation: 0,
	_intention: null,
	_dernier: null, // dernier input de grille ayant eu le focus
	_geste: 0, // horodatage du dernier geste délibéré de l'utilisateur
	_mutation: 0, // horodatage du dernier re-rendu de grille observé
	_observees: null,

	setup() {
		if (this._pose) return;
		this._pose = true;
		this._observees = new WeakSet();

		document.addEventListener("focusin", (e) => this._focusin(e), true);

		// Gestes qui rendent la main à l'utilisateur. Volontairement PAS toute
		// touche : pendant une transition, une 2e Entrée frappée vite (le geste
		// que `pg_grille_entree` met en file) est légitime et ne doit surtout pas
		// annuler le déplacement en cours.
		const rendre_la_main = (e) => {
			if (!e.isTrusted) return;
			this._geste = performance.now();
			this.annuler("geste de l'utilisateur");
		};
		document.addEventListener("mousedown", rendre_la_main, true);
		document.addEventListener("touchstart", rendre_la_main, true);
		document.addEventListener(
			"keydown",
			(e) => {
				if (e.isTrusted && (e.key === "Escape" || e.key === "Tab")) rendre_la_main(e);
			},
			true
		);
	},

	// ─── API ────────────────────────────────────────────────────────────────
	//
	// exiger({ grid, ligne, champ, creer_ligne, sans_defilement, selectionner,
	//          raison })
	//
	// `ligne` est un index 0-based. Renvoie une promesse résolue avec l'input
	// atteint, ou `null` si l'intention a été abandonnée.
	exiger(opts) {
		const grid = opts && opts.grid;
		if (!grid) return Promise.resolve(null);
		return this._lancer({
			genre: "grille",
			grid: grid,
			ligne: opts.ligne || 0,
			champ: opts.champ,
			creer_ligne: !!opts.creer_ligne,
			sans_defilement: !!opts.sans_defilement,
			selectionner: opts.selectionner !== false,
			raison: opts.raison || "",
		});
	},

	// Même chose pour un champ ORDINAIRE du formulaire (Client, Fournisseur…).
	//
	// À l'ouverture d'un nouveau document, Frappe place lui-même le curseur sur le
	// PREMIER champ du formulaire — « Séries », pas le tiers (`form.js`,
	// `focus_on_first_input`). Il s'abstient toutefois dès que le curseur est déjà
	// quelque part dans le formulaire : arriver tôt sur le tiers le neutralise
	// donc par son propre garde-fou, sans rien patcher. Les délais fixes d'avant
	// laissaient au contraire Frappe gagner la course, d'où un curseur qui passait
	// par Séries avant de sauter sur le tiers.
	//
	// L'intention TIENT ensuite pendant tout le démarrage — case Date/Heure,
	// affichage tiers « Code — Nom », séries de nommage, préchauffage PDF — dont
	// les re-rendus pouvaient emporter le curseur.
	exiger_champ(opts) {
		const frm = opts && opts.frm;
		if (!frm || !opts.champ) return Promise.resolve(null);
		return this._lancer({
			genre: "champ",
			frm: frm,
			champ: opts.champ,
			sans_defilement: !!opts.sans_defilement,
			selectionner: opts.selectionner !== false,
			raison: opts.raison || frm.doctype + " → " + opts.champ,
		});
	},

	_lancer(base) {
		this.annuler("remplacée par une intention plus récente");

		const maintenant = performance.now();
		const intention = Object.assign(
			{
				gen: ++this._generation,
				debut: maintenant,
				naissance: maintenant,
				frame: maintenant,
				activation: 0,
				stable: 0,
				rendus: 0,
				ronde: 0,
				resoudre: null,
			},
			base
		);

		const promesse = new Promise((r) => (intention.resoudre = r));
		this._intention = intention;
		this._observer_cible(intention);

		// Première tentative dans le MÊME tick : si la cible est déjà en place, le
		// curseur y est avant même le premier rafraîchissement d'écran.
		this._tour();
		return promesse;
	},

	annuler(motif) {
		const it = this._intention;
		if (!it) return;
		this._intention = null;
		this._generation++;
		if (it.resoudre) it.resoudre(null);
		if (motif && window.__pg_focus_debug) {
			console.debug("[focus_grille] abandon :", motif, it.raison);
		}
	},

	// ─── BOUCLE DE RECONQUÊTE ───────────────────────────────────────────────

	_tour() {
		const it = this._intention;
		if (!it) return;

		const t = performance.now();

		// Onglet en arrière-plan : le temps ne compte pas. Sans cela, revenir sur
		// l'onglet après une minute retrouverait une intention déjà périmée alors
		// qu'elle n'a pas eu UNE SEULE occasion d'avancer.
		if (document.hidden) it.debut += t - it.frame;

		if (this._geste > it.debut) {
			this.annuler("l'utilisateur a repris la main");
			return;
		}

		const input = this._input(it);

		if (!input) {
			// Ligne absente ou pas encore en édition : on la prépare, sans
			// marteler — `activate()` est synchrone mais reste inutile tant que
			// la grille n'est pas éditable.
			if (t - it.activation >= this.PERIODE_ACTIVATION_MS) {
				it.activation = t;
				this._preparer(it);
			}
			it.stable = 0;
		} else if (document.activeElement !== input) {
			this._poser(it, input);
			it.stable = 0;
		} else if (this._mutation > it.frame) {
			// Le curseur est bien là, mais la grille a muté depuis la frame
			// précédente : rien n'est acquis, on recompte.
			it.rendus++;
			it.stable = 0;
		} else if (++it.stable >= this.FRAMES_STABLES) {
			const resoudre = it.resoudre;
			this._intention = null;
			if (resoudre) resoudre(input);
			return;
		}

		if (t - it.debut > this.ECHEANCE_MS || t - it.naissance > this.PLAFOND_ABSOLU_MS) {
			console.warn("[focus_grille] cible non atteinte", {
				raison: it.raison,
				genre: it.genre,
				ligne: it.ligne,
				champ: it.champ,
				re_rendus_traverses: it.rendus,
				input_trouve: !!input,
				focus_reel: document.activeElement && document.activeElement.outerHTML,
			});
			const resoudre = it.resoudre;
			this._intention = null;
			if (resoudre) resoudre(null);
			return;
		}

		it.frame = t;
		this._planifier(it);
	},

	// ⚠️ `requestAnimationFrame` NE SUFFIT PAS À LUI SEUL : il est GELÉ dans un
	// onglet en arrière-plan (mesuré : 1 frame en 300 ms) et bridé par certains
	// bureaux à distance. Une intention posée juste avant un changement de fenêtre
	// resterait donc en plan — précisément le « une fois sur vingt » qu'on chasse.
	// On double la boucle d'un `setTimeout` court : le premier des deux à se
	// présenter fait le tour, le jumeau se désamorce sur le numéro de ronde.
	_planifier(it) {
		const ronde = ++it.ronde;
		const jouer = () => {
			if (this._intention !== it || it.ronde !== ronde) return;
			this._tour();
		};
		requestAnimationFrame(jouer);
		setTimeout(jouer, document.hidden ? this.PERIODE_CACHE_MS : 16);
	},

	// Crée la ligne manquante puis ouvre son édition.
	_preparer(it) {
		if (it.genre !== "grille") return; // un champ ordinaire n'a rien à ouvrir
		const g = it.grid;
		const lignes = g.grid_rows || [];

		if (lignes.length <= it.ligne) {
			// Une seule création, sinon un serveur lent produirait une ligne
			// vide par frame.
			if (it.creer_ligne && !it.ligne_creee) {
				it.ligne_creee = true;
				try {
					g.add_new_row(null, null, true);
				} catch (e) {
					/* la grille n'est pas prête, la frame suivante réessaiera */
				}
			}
			return;
		}

		if (!g.allow_on_grid_editing || !g.allow_on_grid_editing() || !g.is_editable()) return;

		try {
			lignes[it.ligne].activate();
		} catch (e) {
			/* noop : on retentera */
		}
	},

	_poser(it, input) {
		if (input.disabled || input.readOnly) return;
		try {
			if (it.sans_defilement) input.focus({ preventScroll: true });
			else input.focus();
		} catch (e) {
			input.focus();
		}
		if (it.selectionner && document.activeElement === input) {
			try {
				input.select();
			} catch (e) {
				/* champ sans sélection (date, etc.) */
			}
		}
	},

	// ─── LOCALISATION DE LA CIBLE ───────────────────────────────────────────

	_input(it) {
		if (it.genre === "champ") {
			const f = it.frm.fields_dict && it.frm.fields_dict[it.champ];
			const el = f && f.$input && f.$input[0];
			return el && document.contains(el) ? el : null;
		}

		// Voie noble : le contrôle Frappe de la ligne. `document.contains` est
		// indispensable — un input remplacé (ligne manuelle du BL) ou emporté par
		// un re-rendu laisse un `$input` valide mais DÉTACHÉ, sur lequel
		// `focus()` ne fait rien et ne lève rien.
		const ligne = it.grid.grid_rows && it.grid.grid_rows[it.ligne];
		const champs = ligne && ligne.on_grid_fields_dict;
		const f = champs && champs[it.champ];
		if (f && f.$input && f.$input.length && document.contains(f.$input[0])) {
			return f.$input[0];
		}

		const corps = this._corps(it.grid);
		if (!corps) return null;
		return corps.querySelector(
			'.grid-row[data-idx="' +
				(it.ligne + 1) +
				'"] [data-fieldname="' +
				it.champ +
				'"] input'
		);
	},

	_corps(grid) {
		return (grid && grid.wrapper && grid.wrapper[0]) || null;
	},

	_reperer(el) {
		if (!el || el.tagName !== "INPUT") return null;
		const ligne_el = el.closest(".grid-row[data-idx]");
		if (!ligne_el) return null;
		const cellule = el.closest("[data-fieldname]");
		if (!cellule) return null;
		const gr = $(ligne_el).data("grid_row");
		const grid = gr && gr.grid;
		if (!grid) return null;
		return {
			grid: grid,
			ligne: parseInt(ligne_el.getAttribute("data-idx"), 10) - 1,
			champ: cellule.getAttribute("data-fieldname"),
		};
	},

	// ─── OBSERVATION DES RE-RENDUS ──────────────────────────────────────────

	_observer_cible(it) {
		if (it.genre === "grille") return this._observer(this._corps(it.grid), it.grid);
		const w = it.frm && it.frm.layout && it.frm.layout.wrapper;
		return this._observer(w && w[0], null);
	},

	// `grid` peut être nul : on observe alors un formulaire, où la cicatrisation
	// (qui ne sait reconquérir qu'une cellule de grille) n'a pas lieu d'être.
	_observer(element, grid) {
		if (!element || this._observees.has(element)) return;
		this._observees.add(element);
		// Sur le wrapper entier et non sur `.grid-body` : quand le formulaire se
		// reconstruit, c'est `.grid-body` lui-même qui est remplacé.
		new MutationObserver(() => this._mute(grid)).observe(element, {
			childList: true,
			subtree: true,
		});
	},

	_mute(grid) {
		this._mutation = performance.now();
		if (grid) this._cicatriser(grid);
	},

	// Reconquête SANS intention déclarée : le filet qui couvre les grilles dont
	// le code n'a pas été récrit. Un champ de grille qui avait le curseur vient
	// d'être détruit par un re-rendu, et le focus est retombé sur `<body>` —
	// personne ne l'a demandé, donc on le remet où il était.
	_cicatriser(grid) {
		if (this._intention) return;

		const d = this._dernier;
		if (!d || d.grid !== grid) return;
		if (document.contains(d.el)) return;
		if (performance.now() - d.t > this.FENETRE_CICATRISATION_MS) return;
		if (this._geste > d.t) return;

		// Le curseur est-il vraiment orphelin ? S'il est passé à un autre champ,
		// c'est une transition voulue (par l'appli ou par l'utilisateur) : on ne
		// la contrarie pas.
		const actif = document.activeElement;
		if (actif && actif !== document.body && actif !== document.documentElement) return;

		this.exiger({
			grid: grid,
			ligne: d.ligne,
			champ: d.champ,
			raison: "cicatrisation après re-rendu de la grille",
		});
	},

	_focusin(e) {
		const rep = this._reperer(e.target);
		if (!rep) return;

		this._dernier = {
			el: e.target,
			grid: rep.grid,
			ligne: rep.ligne,
			champ: rep.champ,
			t: performance.now(),
		};
		this._observer(this._corps(rep.grid), rep.grid);

		// L'application a placé le curseur sur un AUTRE champ de grille que celui
		// que nous visons : elle a changé d'avis, notre intention est périmée.
		// (Notre propre focus vise la cible, il ne passe donc jamais par ici.)
		const it = this._intention;
		if (it && (rep.ligne !== it.ligne || rep.champ !== it.champ)) {
			this.annuler("le curseur a été placé sur un autre champ");
		}
	},
};

param_global.focus_grille.setup();
