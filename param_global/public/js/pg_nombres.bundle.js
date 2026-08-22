// Les nombres au standard français : deux volets, une seule cause racine.
//
//   1. SAISIE   — le point tapé devient une virgule.
//   2. AFFICHAGE — deux décimales même sur une valeur ronde (1 -> « 1,00 »).
//
// ─────────────────────────────────────────────────────────────────────────────
// VOLET 1 — SAISIE : le point devient une virgule
// ─────────────────────────────────────────────────────────────────────────────
//
// PROBLÈME — `System Settings.number_format` vaut « #.###,## » (standard français,
// imposé par `apply_global_params()`). Dans ce format, le POINT est le séparateur
// de MILLIERS : Frappe le supprime purement et simplement au parsing.
//
//     flt("12.50")   -> 1250     (x100)
//     flt("443.88")  -> 44388    (x100)
//     flt("0.5")     -> 5        (x10)
//     flt("12,50")   -> 12,5     correct
//
// Or le pavé numérique ne porte qu'un point. Un prix ou une quantité saisis au
// pavé entraient donc cent fois trop grands, SANS aucun message — risque
// comptable direct sur un Bon de Réception ou un Paiement, erreur de stock sur
// une quantité.
//
// CORRECTIF — on intercepte la touche et on écrit une virgule à la place. Le
// nombre affiché devient « 12,50 » : l'utilisateur voit immédiatement ce qui sera
// enregistré.
//
// POURQUOI À LA FRAPPE ET NON AU PARSING — convertir « . » en « , » au moment du
// parsing serait invisible mais CASSERAIT les valeurs légitimes : Frappe
// reformate les champs au blur et y réécrit « 1.234,56 », où le point est un vrai
// séparateur de milliers. La conversion aveugle donnerait « 1,234,56 ». En
// n'agissant que sur la touche pressée, on ne touche jamais aux valeurs posées
// par le programme.
//
// PÉRIMÈTRE : TOUS les champs où l'on saisit un nombre — `Currency` (montants),
// `Float` (Quantité, TVA), `Percent` (Remise) et `Int`. Le piège ne portait pas que
// sur l'argent : « 1.5 » en Quantité valait 15, soit une erreur de STOCK.
//
// Cas de `Int` : un entier n'a pas de décimale, on pourrait croire qu'il faut juste
// avaler le point. Ce serait pire — « 12 » puis point avalé puis « 50 » donnerait
// « 1250 ». En écrivant la virgule, on obtient « 12,50 » que `cint` ramène à 12,
// c'est-à-dire ce que l'utilisateur voulait dire. Une seule règle partout.
//
// NON couverts, volontairement : `Duration` (widget hh:mm:ss, le point n'y a aucun
// sens) et `Rating` (étoiles, pas de saisie texte). Les champs non numériques
// (`Data`, `Code`, `Date`…) ne sont jamais touchés : un point y est légitime.
//
// Le collage n'est pas traité (seule la frappe l'est) : une valeur collée peut
// contenir un vrai séparateur de milliers, on ne veut pas avoir à le deviner.
//
// ─────────────────────────────────────────────────────────────────────────────
// VOLET 2 — AFFICHAGE : toujours deux décimales
// ─────────────────────────────────────────────────────────────────────────────
//
// `apply_global_params()` pose `float_precision = 2`, mais ça ne suffit pas : le
// formateur Float de Frappe RETIRE les décimales quand la partie fractionnaire est
// nulle (`formatters.js` : « show 1.000000 as 1 »), sauf si on lui passe
// `always_show_decimals`. Résultat, dans une même grille :
//
//     Quantité 1     -> « 1 »        Quantité 2,5 -> « 2,50 »
//
// Deux standards côte à côte, et un montant en « 1,50 » en face d'une quantité en
// « 1 ». Les vues Rapport et les Script Reports passent déjà `always_show_decimals`
// (d'où un relevé imprimé correct), mais PAS les formulaires ni les grilles.
//
// On force donc le drapeau dans le formateur Float, une fois pour toutes.
//
// `Int` n'est volontairement PAS touché : un entier n'a pas de décimale, « 5,00 »
// pour un compteur de lignes serait faux.
//
// Côté MONTANTS, le symptôme était l'inverse : trop de décimales, et de façon
// erratique — « 35,36 » sur une ligne, « 42,4320 » sur la suivante. En cause, les
// Property Setters `precision = 4` posés volontairement par `bon_livraison` et
// `bon_reception` sur `rate` / `amount` / `prix_ht` (les prix Omag portent jusqu'à
// 4 décimales, indispensables au calcul de TVA « prix TTC inclus »). Le formateur
// Currency ne retombe à 2 décimales que si la valeur en compte MOINS DE 3
// (`formatters.js`, le bloc commenté « a company in UAE ») : d'où l'alternance.
//
// ⚠️ On corrige l'AFFICHAGE SEUL, jamais la précision stockée. Repasser `amount` à
// 2 décimales déplacerait 4 526 lignes de BL et 992 de BR (~15 DH), donc les
// `grand_total` que la réconciliation Omag compare à 0,01 DH près par client.
//
// Le `docfield` est CLONÉ avant d'y forcer la précision : le muter casserait les
// calculs, qui lisent la même propriété. Et seul le formateur est touché, pas
// `format_for_input()` : cliquer dans un prix affiche toujours ses 4 décimales
// réelles pour l'éditer, aucune troncature silencieuse à la sortie du champ.
//
// ─────────────────────────────────────────────────────────────────────────────
// VOLET 3 — SAISIE : une lettre tapée dans un champ numérique n'entre pas
// ─────────────────────────────────────────────────────────────────────────────
//
// PROBLÈME — rien n'empêchait de taper des LETTRES dans une Quantité ou un Prix.
// Le champ affichait « abc » sans broncher, et le parsing ne rendait la main
// qu'au change/blur : Entrée écrivait alors `0` dans le document. Zéro message,
// zéro trace — une quantité ou un prix silencieusement annulé, sur un BL comme
// sur un Paiement.
//
// CORRECTIF — la touche est refusée À LA FRAPPE, comme le point du volet 1 : rien
// ne s'affiche, il n'y a donc plus de valeur trompeuse à corriger au blur.
//
// ACCEPTÉS : les chiffres, la virgule (séparateur décimal français), le point
// (converti en virgule par le volet 1 — on le laisse donc passer jusqu'à lui) et
// le signe moins (un montant de Paiement BL est négatif sur une sortie de caisse,
// cf. app `caisse`). Tout le reste est refusé.
//
// JAMAIS TOUCHÉES : les touches de contrôle (Backspace, Tab, flèches, Entrée…,
// reconnues à leur `key` de plus d'un caractère) et les raccourcis Ctrl/Cmd/Alt —
// sans quoi Ctrl+A ou Ctrl+C ne fonctionneraient plus dans un champ numérique.
//
// Le COLLAGE reste non traité, par cohérence avec le volet 1 : une valeur collée
// peut venir d'un tableur et porter un vrai séparateur de milliers.
//

frappe.provide("param_global.nombres");

param_global.nombres = {
	// Types de champs où l'on saisit un nombre.
	CHAMPS_NUMERIQUES: ["Currency", "Float", "Percent", "Int"],

	// Le pavé numérique remonte « . » sur la plupart des dispositions, « Decimal »
	// sur certaines.
	TOUCHES_POINT: [".", "Decimal"],

	// Seuls caractères qu'on laisse entrer dans un champ numérique (volet 3).
	// Le point y figure : c'est le volet 1 qui le transforme en virgule.
	CARACTERES_AUTORISES: /^[0-9.,-]$/,

	setup() {
		if (this._pose) return;
		this._pose = true;
		const self = this;

		$(document).on("keydown.pg_decimale", "input", function (e) {
			if (!self.TOUCHES_POINT.includes(e.key)) return;
			// Raccourcis clavier (Ctrl+., etc.) : laisser passer.
			if (e.ctrlKey || e.metaKey || e.altKey) return;

			const controle = ($(this).closest(".frappe-control")[0] || {}).fieldobj;
			const type = controle && controle.df && controle.df.fieldtype;
			if (!self.CHAMPS_NUMERIQUES.includes(type)) return;

			e.preventDefault();

			const input = this;
			const valeur = input.value || "";
			const debut = input.selectionStart;
			const fin = input.selectionEnd;

			// Une virgule déjà présente (hors sélection remplacée) : on avale le point
			// plutôt que de produire deux séparateurs décimaux.
			const restant = valeur.slice(0, debut) + valeur.slice(fin);
			if (restant.includes(",")) return;

			input.value = `${valeur.slice(0, debut)},${valeur.slice(fin)}`;
			input.setSelectionRange(debut + 1, debut + 1);

			// Frappe ne parse qu'au change/blur, mais une frappe réelle émet aussi un
			// événement `input` : on le reproduit pour que tout ce qui l'écoute (suivi
			// des modifications de la grille, par exemple) se comporte à l'identique.
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
	},

	// VOLET 3 — refuse à la frappe tout caractère qui n'a rien à faire dans un
	// nombre. Gestionnaire séparé de celui du volet 1 : celui-ci ne fait que
	// REFUSER, l'autre RÉÉCRIT — et le point doit traverser le premier pour
	// atteindre le second, d'où sa présence dans CARACTERES_AUTORISES.
	setup_blocage() {
		if (this._blocage_pose) return;
		this._blocage_pose = true;
		const self = this;

		$(document).on("keydown.pg_blocage", "input", function (e) {
			// Raccourcis clavier (Ctrl+A, Cmd+C, …) : ne jamais y toucher.
			if (e.ctrlKey || e.metaKey || e.altKey) return;

			// `key` de plus d'un caractère = touche de contrôle (Backspace, Tab,
			// ArrowLeft, Enter, Decimal…) : elles doivent toutes rester libres.
			const touche = e.key;
			if (!touche || touche.length !== 1) return;

			// Saisie en cours de composition (clavier arabe, accents morts) : le
			// navigateur n'a pas encore arrêté le caractère final, on le laisse finir.
			if (e.originalEvent && e.originalEvent.isComposing) return;

			const controle = ($(this).closest(".frappe-control")[0] || {}).fieldobj;
			const type = controle && controle.df && controle.df.fieldtype;
			if (!self.CHAMPS_NUMERIQUES.includes(type)) return;

			if (self.CARACTERES_AUTORISES.test(touche)) return;

			e.preventDefault();
		});
	},

	forcer_deux_decimales() {
		const formateurs = frappe.form && frappe.form.formatters;
		// Pas encore chargé : l'appel au DOM ready repassera.
		if (!formateurs || typeof formateurs.Float !== "function") return false;
		if (typeof formateurs.Currency !== "function") return false;
		if (formateurs._pg_decimales_forcees) return true;

		// Float : ne jamais escamoter les décimales d'une valeur ronde.
		const float_natif = formateurs.Float;
		formateurs.Float = function (value, docfield, options, doc) {
			return float_natif.call(
				this,
				value,
				docfield,
				{ ...(options || {}), always_show_decimals: true },
				doc
			);
		};

		// Currency : plafonner l'affichage, sans jamais toucher au docfield partagé.
		const currency_natif = formateurs.Currency;
		formateurs.Currency = function (value, docfield, options, doc) {
			const df = Object.assign({}, docfield || {}, {
				precision: cint(frappe.boot.sysdefaults.currency_precision) || 2,
			});
			return currency_natif.call(this, value, df, options, doc);
		};

		formateurs._pg_decimales_forcees = true;
		return true;
	},

	setup_tout() {
		this.setup();
		this.setup_blocage();
		return this.forcer_deux_decimales();
	},
};

// Deux tentatives : au chargement du bundle (cas normal) puis au DOM ready en filet
// de sécurité si l'ordre de chargement changeait. Les deux volets sont idempotents.
if (!param_global.nombres.setup_tout()) {
	$(() => param_global.nombres.setup_tout());
}
