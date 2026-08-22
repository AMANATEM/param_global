// Aucune Entrée perdue dans les grilles : les frappes trop rapides sont mises en
// file au lieu d'être avalées.
//
// PROBLÈME — la navigation clavier des grilles (Article → Quantité → Prix → ligne
// suivante) déplace le curseur dans un `setTimeout` : le champ ne peut recevoir le
// focus qu'une fois la valeur enregistrée et la grille re-rendue.
//
//     if (fieldname === "qty") {
//         save_field_value(frm, rowIndex, "qty", $input.val());
//         setTimeout(() => focusField(frm, rowIndex, "rate"), 150);
//     }
//
// Pendant ces 150 à 250 ms, le curseur est TOUJOURS sur la quantité. Une deuxième
// Entrée frappée dans l'intervalle — le geste naturel de qui veut enchaîner sur
// l'article suivant — retombait donc sur le MÊME champ : elle rejouait la même
// transition « quantité → prix » au lieu de faire « prix → ligne suivante ». Le
// curseur s'arrêtait sur le prix, exactement comme si l'on n'avait tapé qu'une
// fois. Symptôme trompeur : la touche semblait « ne pas prendre », alors qu'elle
// était bel et bien reçue — mais par le mauvais champ.
//
// CORRECTIF — on ne laisse plus la deuxième Entrée agir sur un champ qui est en
// train de céder le curseur : on la MET EN FILE, puis on la REJOUE sur le champ
// qui vient de recevoir le focus. Chaque Entrée vaut alors exactement une étape,
// quelle que soit la vitesse de frappe.
//
// EN PHASE DE CAPTURE, sur `document` — c'est la seule position qui précède les
// gestionnaires des apps, tous délégués sur le wrapper de la grille (donc en
// bouillonnement). `stopPropagation()` y suffit à neutraliser la frappe en trop :
// l'événement n'atteint jamais le wrapper.
//
// DÉSAMORÇAGE DE NOTRE PROPRE REJEU — l'Entrée synthétique repasse par ce même
// gestionnaire ; sans le drapeau `__pg_rejeu`, elle serait prise pour un doublon
// et avalée à son tour. `keyCode` / `which` sont posés à la main : le constructeur
// `KeyboardEvent` les ignore, et c'est sur eux que les apps testent la touche
// (`if (e.keyCode !== 13 && e.which !== 13) return;`).
//
// PÉRIMÈTRE : tout `input` de grille, dans toutes les apps — Bon de Livraison,
// Retour, Devis, Bon de Commande, Bon de Réception, Écriture de Stock,
// Réconciliation de Stock partagent le même code de navigation, dupliqué sept
// fois. Le corriger ici les couvre d'un coup, et couvrira les suivantes.
//
// ⚠️ Hors de ces grilles à navigation, une Entrée en double n'a de toute façon
// aucun effet dans Frappe : la mettre en file ne retire donc rien. La file expire
// d'elle-même au bout de ATTENTE_MAX_MS, pour qu'une Entrée en attente ne parte
// jamais se déclencher sur un champ sans rapport, plusieurs secondes plus tard.

frappe.provide("param_global.grille_entree");

param_global.grille_entree = {
	// Deux Entrée sur le même champ dans cette fenêtre = frappe rapide, la
	// seconde est mise en file. Au-delà, c'est une Entrée délibérée : elle passe.
	FENETRE_MS: 900,

	// Une Entrée en file au-delà de ce délai est abandonnée : le curseur n'a pas
	// bougé, la transition attendue n'a pas eu lieu.
	ATTENTE_MAX_MS: 2000,

	// Plafond de la file : au-delà, l'utilisateur martèle la touche et rejouer
	// dix étapes d'affilée créerait des lignes vides à la chaîne.
	FILE_MAX: 3,

	// Délai avant le rejeu : les apps enchaînent `focus()` puis un `select()`
	// différé, on laisse le champ finir de s'installer avant de le solliciter.
	DELAI_REJEU_MS: 40,

	_dernier: null, // { el, t } — dernière Entrée acceptée, et sur quel champ
	_file: 0,
	_expire: 0,

	setup() {
		if (this._pose) return;
		this._pose = true;

		document.addEventListener("keydown", (e) => this._keydown(e), true);
		document.addEventListener("focusin", (e) => this._focusin(e), true);
	},

	// Un `input` de ligne de grille — seul endroit où la navigation enchaînée existe.
	_champ_grille(el) {
		if (!el || el.tagName !== "INPUT") return null;
		return el.closest(".grid-row") ? el : null;
	},

	_keydown(e) {
		if (e.key !== "Enter" && e.keyCode !== 13 && e.which !== 13) return;

		const champ = this._champ_grille(e.target);
		if (!champ) return;

		const maintenant = Date.now();

		// Notre propre rejeu : il doit traverser intact jusqu'aux apps, et devient
		// à son tour la référence pour un éventuel doublon suivant.
		if (e.__pg_rejeu) {
			this._dernier = { el: champ, t: maintenant };
			return;
		}

		const doublon =
			this._dernier &&
			this._dernier.el === champ &&
			maintenant - this._dernier.t < this.FENETRE_MS;

		if (!doublon) {
			this._dernier = { el: champ, t: maintenant };
			return;
		}

		// Frappe en trop sur un champ qui est en train de céder le curseur : on la
		// retire de la course et on la garde pour le champ suivant.
		e.preventDefault();
		e.stopPropagation();
		this._file = Math.min(this._file + 1, this.FILE_MAX);
		this._expire = maintenant + this.ATTENTE_MAX_MS;
	},

	_focusin(e) {
		if (!this._file) return;

		const maintenant = Date.now();
		if (maintenant >= this._expire) {
			// Le curseur n'a pas bougé à temps : on oublie, plutôt que de déclencher
			// une étape fantôme sur un champ que l'utilisateur a choisi entre-temps.
			this._file = 0;
			return;
		}

		const champ = this._champ_grille(e.target);
		if (!champ) return;
		// Même champ qu'avant : le focus n'a pas réellement progressé (re-rendu de
		// la grille, `select()`), rien à rejouer.
		if (this._dernier && this._dernier.el === champ) return;

		this._file -= 1;
		this._dernier = { el: champ, t: maintenant };
		setTimeout(() => this._rejouer(champ), this.DELAI_REJEU_MS);
	},

	_rejouer(champ) {
		// Le curseur a pu repartir ailleurs entre-temps (clic de l'utilisateur) :
		// on ne rejoue que si le champ a toujours la main.
		if (document.activeElement !== champ) return;

		const evenement = new KeyboardEvent("keydown", {
			key: "Enter",
			code: "Enter",
			bubbles: true,
			cancelable: true,
		});
		Object.defineProperty(evenement, "keyCode", { get: () => 13 });
		Object.defineProperty(evenement, "which", { get: () => 13 });
		evenement.__pg_rejeu = true;

		champ.dispatchEvent(evenement);
	},
};

param_global.grille_entree.setup();
