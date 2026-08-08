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

frappe.provide("param_global.nombres");

param_global.nombres = {
	// Types de champs où l'on saisit un nombre.
	CHAMPS_NUMERIQUES: ["Currency", "Float", "Percent", "Int"],

	// Le pavé numérique remonte « . » sur la plupart des dispositions, « Decimal »
	// sur certaines.
	TOUCHES_POINT: [".", "Decimal"],

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
		return this.forcer_deux_decimales();
	},
};

// Deux tentatives : au chargement du bundle (cas normal) puis au DOM ready en filet
// de sécurité si l'ordre de chargement changeait. Les deux volets sont idempotents.
if (!param_global.nombres.setup_tout()) {
	$(() => param_global.nombres.setup_tout());
}
