// Un doctype n'est initialisé qu'UNE FOIS par session.
//
// ── Le problème ────────────────────────────────────────────────────────────
// `frappe.model.init_doctype()` (frappe/model/model.js) ré-exécute le fichier
// de liste de l'app propriétaire :
//
//     if (meta[asset_key]) new Function(meta[asset_key])();   // __list_js
//
// Or `with_doctype()` ne court-circuite que si `locals.DocType[doctype]` est
// DÉJÀ rempli. Deux appels partis avant l'arrivée de la première réponse font
// donc deux requêtes et deux `init_doctype()` — le fichier est évalué deux fois.
//
// Nos quinze fichiers `*_list.js` s'enchaînent tous sur eux-mêmes :
//
//     const previous_onload = settings.onload;
//     settings.onload = function (lv) { previous_onload(lv); /* ajoute les filtres */ };
//
// Chaque évaluation emboîte donc la précédente, et les filtres Période / Date /
// Mode sont ajoutés autant de fois que le fichier a été évalué. C'est la ligne
// de filtres dupliquée que voyaient les utilisateurs, par intermittence, à la
// première ouverture d'une liste — et qu'un rechargement de page faisait
// disparaître, le contexte JS repartant à zéro.
//
// ── Le correctif ───────────────────────────────────────────────────────────
// On ne corrige pas les quinze fichiers un par un : on rend VRAIE l'hypothèse
// qu'ils font tous, à savoir être évalués une seule fois. Un seul endroit, et
// les listes écrites plus tard en héritent.
//
// ⚠️ Contrepartie assumée : modifier un doctype en cours de session ne recharge
// plus le JS de sa liste avant le prochain rafraîchissement de la page. Sans
// effet en pratique — ce JS vit dans les apps, pas dans l'UI.
//
// ⚠️ Ceci se greffe sur une fonction interne de Frappe. Une montée de version
// qui la renommerait désactiverait le correctif — d'où l'avertissement console,
// et le même réflexe que pour `pg_link_search` : retester après une montée de
// version en ouvrant une liste depuis une carte de l'accueil.

frappe.provide("frappe.model");

(function () {
	if (frappe.model.__pg_init_doctype_unique) return;

	const _init_doctype = frappe.model.init_doctype;
	if (typeof _init_doctype !== "function") {
		console.warn(
			"[param_global] frappe.model.init_doctype introuvable : le correctif des filtres dupliqués est INACTIF."
		);
		return;
	}

	const deja_initialises = new Set();

	frappe.model.init_doctype = function (doctype) {
		if (deja_initialises.has(doctype)) return;
		deja_initialises.add(doctype);
		return _init_doctype.call(this, doctype);
	};

	frappe.model.__pg_init_doctype_unique = true;
})();
