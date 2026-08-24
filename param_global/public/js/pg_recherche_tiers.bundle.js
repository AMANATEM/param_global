// La liste Client / Fournisseur s'affiche TOUJOURS en « Code — Nom ».
//
// PROBLÈME — le dropdown d'un champ tiers sortait tantôt en « C000001 —
// PARTICULIER » (notre recherche serveur), tantôt en « AMAL JAMAL, Commercial,
// Morocco » (la recherche standard de Frappe : nom, groupe client, région).
// Environ une fois sur deux, et de façon STABLE pour toute la vie du document —
// pas un clignotement. Deux mécanismes s'additionnent :
//
//  1. `get_query` est un emplacement « LE DERNIER QUI ÉCRIT GAGNE ».
//     `frm.set_query(champ, q)` se réduit à `fields_dict[champ].get_query = q`
//     (form.js). Nos affichages tiers y écrivent leur requête ; les contrôleurs
//     d'ERPNext écrivent la leur au même endroit. Le gagnant dépend de l'ordre
//     d'exécution, donc de la vitesse du poste et des réponses du serveur.
//
//  2. Le CACHE de link.js fige ensuite le perdant. Les résultats sont mémorisés
//     dans `$input.cache[doctype][terme]` et resservis tels quels à la
//     réouverture — SANS que la requête entre dans la clé. La liste qui a gagné
//     la toute première ouverture s'impose donc jusqu'à la fermeture du
//     document. D'où le 50/50 stable, et non un affichage qui vacille.
//
// POURQUOI LE CORRECTIF PRÉCÉDENT NE POUVAIT PAS TENIR — il réécrivait
// `get_query` une deuxième fois dans un `setTimeout(…, 0)`, puis une troisième
// au focus, en vidant le cache au passage. C'est-à-dire qu'il tentait de GAGNER
// LA COURSE EN ÉCRIVANT PLUS TARD. Une course ne se gagne pas, elle se supprime.
//
// CORRECTIF — on cesse de disputer l'emplacement `get_query`, et on impose la
// requête au DERNIER POINT DE PASSAGE avant l'appel serveur : `set_custom_query`
// est la méthode que link.js appelle juste avant `frappe.desk.search.search_link`,
// une fois `get_query` déjà consulté. Peu importe qui a écrit quoi, ni quand :
// c'est notre requête qui part. Aucune hypothèse d'ordre, donc plus de course.
//
// Le point 2 reste traité par les affichages tiers eux-mêmes, qui vident le cache
// AU FOCUS. C'est le bon endroit : entre deux recherches, rien n'est en vol.
//
// ⚠️ NE PAS VIDER LE CACHE DEPUIS `set_custom_query`. C'est tentant — ce serait
// l'endroit qui voit tout —, mais link.js crée `cache[doctype]` JUSTE AVANT
// d'appeler cette méthode et son callback y écrit au retour du serveur
// (`cache[doctype][terme] = r.message`). Remplacer `$input.cache` fait lever un
// TypeError dans ce callback, AVANT la ligne qui alimente `awesomplete.list` :
// plus AUCUNE liste ne s'affiche, sur tous les champs tiers à la fois. Essayé le
// 2026-08-24, panne immédiate en production. Le forçage de requête ci-dessous se
// suffit à lui-même : il n'a besoin d'aucune purge pour être correct.
//
// PÉRIMÈTRE : tous les champs tiers du bench — BL, Retour, Paiement BL, BR,
// Paiement BR, Bon de Commande, Devis, Bon E/S — plus les filtres de liste et de
// rapport. Chaque affichage tiers (`bl_party_display`, `br_party_display`,
// `bc.party_display`, `rapport.party_display`) déclare sa méthode ici par
// `imposer(ctrl, methode)` ; le reste se passe sans eux.

frappe.provide("param_global.recherche_tiers");

param_global.recherche_tiers = {
	// Posée sur le CONTRÔLE et non sur le formulaire : les filtres de liste et de
	// rapport sont des contrôles Link isolés, sans `frm` auquel se rattacher.
	CLE: "_pg_tiers_methode",

	// Déclare la recherche serveur qui fait foi pour ce champ tiers.
	// `methode` nulle LIBÈRE le champ : le Devis bascule entre Client et
	// Fournisseur sur le même `party_name`, et la recherche client ne vaut plus
	// dès qu'il s'adresse à un fournisseur.
	imposer(ctrl, methode) {
		if (!ctrl) return;
		if (!methode) {
			delete ctrl[this.CLE];
			return;
		}
		ctrl[this.CLE] = methode;
	},

	patch() {
		const ControlLink = frappe.ui && frappe.ui.form && frappe.ui.form.ControlLink;
		// Classe pas encore chargée : l'appel au DOM ready repassera.
		if (!ControlLink) return false;
		if (ControlLink.prototype._pg_tiers_patche) return true;

		const natif = ControlLink.prototype.set_custom_query;
		if (typeof natif !== "function") {
			// ⚠️ FRAGILITÉ CONNUE, même nature que pg_link_search et pg_tri_dropdown :
			// on greffe sur une méthode interne de Frappe. Renommée par une montée de
			// version, le dropdown tiers redeviendrait EN SILENCE tantôt « Code — Nom »
			// tantôt « Nom, Groupe, Région ». D'où l'avertissement.
			console.warn(
				"[param_global] ControlLink.set_custom_query est absent : la liste " +
					"Client / Fournisseur peut repasser au format standard de Frappe. " +
					"Vérifier link.js après la dernière montée de version de Frappe."
			);
			return false;
		}

		const CLE = this.CLE;

		ControlLink.prototype.set_custom_query = function (args) {
			// Le natif d'abord : il pose les filtres du champ, ceux du doctype et
			// ceux de `get_query`. On ne lui retire rien, on tranche seulement la
			// question de la REQUÊTE.
			natif.call(this, args);

			const methode = this[CLE];
			if (!methode) return;

			args.query = methode;

			// Les filtres restants viennent peut-être d'une requête concurrente qui
			// ne connaît pas la nôtre. Nos recherches tiers ignorent `filters` (elles
			// ne lisent que `txt`), donc les laisser passer est sans effet — et les
			// retirer priverait un futur appelant d'un filtre légitime.

		};

		ControlLink.prototype._pg_tiers_patche = true;
		return true;
	},
};

// Deux tentatives : au chargement du bundle (cas normal — la classe est déjà là,
// les bundles d'app sont injectés après ceux de frappe) puis au DOM ready en
// filet de sécurité si l'ordre de chargement changeait. `patch()` est idempotent.
if (!param_global.recherche_tiers.patch()) {
	$(() => param_global.recherche_tiers.patch());
}
