// Recherche multi-mots dans les champs Link : rétablit la validation par Entrée.
//
// PROBLÈME — Frappe (link.js, `awesomplete-select`) annule la sélection quand on
// valide au clavier si le texte saisi n'est pas une SOUS-CHAÎNE CONTIGUË du
// libellé ou de la description du résultat surligné :
//
//     } else if (input && !me.input_matches_item(input, item)) {
//         e.preventDefault();
//
//     input_matches_item(input, item) {
//         ...
//         return input && (item_label.includes(input) || item_description.includes(input));
//     }
//
// Or toutes nos recherches serveur (`recherche_article`, `recherche_client`,
// `recherche_fournisseur`, `article_query`…) découpent la saisie en jetons et
// exigent seulement que CHAQUE jeton apparaisse quelque part, dans l'ordre qu'on
// veut. Le dropdown affichait donc le bon résultat, mais Entrée ne faisait
// RIEN — ni sélection, ni message : « rlx 3x2.5 » trouve bien
// « RLX CABLE SOUPLE 3X2.5 … », sauf que les deux mots n'y sont pas adjacents.
//
// Touchait les articles du Bon de Réception, les tiers en en-tête de BL / BR /
// Devis / Bon de Commande / Paiement BL / Paiement BR / Retour (« F000208
// AABDOLLAH » échouait déjà à cause du séparateur « — » du libellé), et les
// filtres Link des rapports — où l'effet était pire : le filtre gardait le texte
// brut et le rapport ne se lançait pas, sans erreur.
//
// CORRECTIF — on élargit `input_matches_item` au même critère que le serveur :
// chaque jeton de la saisie doit apparaître dans le libellé ou la description.
// Le contrôle natif reste la voie rapide (on l'appelle en premier), donc on ne
// fait qu'ACCEPTER davantage, jamais moins. Le garde-fou garde son rôle : une
// saisie sans rapport avec la ligne surlignée est toujours refusée.
//
// Patch posé sur le prototype de ControlLink → couvre d'un coup les champs Link,
// les Dynamic Link (Devis → party_name) et les filtres de rapport, qui passent
// tous par la même classe. Il rend redondants — sans les casser — les
// contournements maison déjà en place (`select_article_then_qty` du BL/Devis/
// Bon de Commande/Retour, `select_link_then_focus` de l'Écriture et de la
// Réconciliation de Stock), qui posent la valeur eux-mêmes sans passer par
// `select()`.

frappe.provide("param_global.link_search");

param_global.link_search = {
	patch() {
		const ControlLink = frappe.ui && frappe.ui.form && frappe.ui.form.ControlLink;
		// Classe pas encore chargée : l'appel au DOM ready repassera.
		if (!ControlLink) return false;
		if (ControlLink.prototype._pg_token_match_patched) return true;

		const natif = ControlLink.prototype.input_matches_item;
		if (typeof natif !== "function") {
			// ⚠️ FRAGILITÉ CONNUE : on greffe sur une méthode interne de Frappe. Si une
			// montée de version la renomme ou la supprime, ce patch ne s'applique plus
			// EN SILENCE et la validation par Entrée des recherches multi-mots se
			// recasse sur les 11 champs. D'où l'avertissement : après toute montée de
			// version de Frappe, retester « rlx 3x2.5 » + Entrée sur un Bon de Réception.
			console.warn(
				"[param_global] ControlLink.input_matches_item est absent : le correctif " +
					"de recherche multi-mots ne s'applique pas. Vérifier link.js après la " +
					"dernière montée de version de Frappe."
			);
			return false;
		}

		ControlLink.prototype.input_matches_item = function (input, item) {
			// Sous-chaîne contiguë : comportement natif, on n'y touche pas.
			if (natif.call(this, input, item)) return true;

			const jetons = String(input || "")
				.toLowerCase()
				.split(/\s+/)
				.filter(Boolean);
			if (!jetons.length) return false;

			// `item` est forcément exploitable ici : l'appel natif ci-dessus le
			// déréférence déjà, donc un `item` absent aurait levé avant nous. Rien à
			// garder de plus — ce cas limite est celui de Frappe, on ne le change pas.
			const libelle = (this.get_translated(item.label || item.value) || "").toLowerCase();
			const description = (item.description || "").toLowerCase();
			const botte_de_foin = `${libelle} ${description}`;

			return jetons.every((jeton) => botte_de_foin.includes(jeton));
		};

		ControlLink.prototype._pg_token_match_patched = true;
		return true;
	},
};

// Deux tentatives : au chargement du bundle (cas normal — la classe est déjà là,
// les bundles d'app sont injectés après ceux de frappe) puis au DOM ready en
// filet de sécurité si l'ordre de chargement changeait. `patch()` est idempotent.
if (!param_global.link_search.patch()) {
	$(() => param_global.link_search.patch());
}
