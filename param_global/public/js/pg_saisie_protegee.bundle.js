// Une frappe en cours n'est JAMAIS effacée par un rafraîchissement du formulaire.
//
// SYMPTÔME — on ouvre un BL (ou n'importe quel document du bench), on tape vite
// « ABCDEFG » dans le Client, et l'écran affiche « DEFG » : les premières
// lettres ont disparu.
//
// CAUSE — à l'ouverture, le formulaire se rafraîchit plusieurs fois (retours
// serveur, valeurs par défaut, contrôleurs ERPNext). Chaque rafraîchissement
// d'un champ passe par `refresh_input()` → `set_input(valeur du document)` →
// `set_formatted_input()`, qui RÉÉCRIT la case avec la valeur du document. Or
// un champ Link n'écrit dans le document qu'une fois la valeur choisie : tant
// qu'on tape, le document dit « vide », et la case est remise à blanc sous les
// doigts. Pire, `ControlLink.set_formatted_input` appelle
// `super.set_formatted_input()` SANS ARGUMENT : la case est vidée à chaque
// rafraîchissement, avant même que le titre soit reposé.
//
// CORRECTIF — on n'écrit pas une valeur VIDE par-dessus du texte que
// l'utilisateur est en train de taper : case qui a le curseur ET qui a reçu une
// vraie frappe depuis qu'elle l'a. Tout autre cas passe inchangé — une valeur
// réelle posée par programme (client choisi, article sélectionné) s'écrit
// toujours, et un champ quitté redevient le reflet exact du document.
//
// Posé sur `ControlData.prototype`, il couvre d'un coup Data, Link, Dynamic Link
// et Autocomplete, dans les formulaires comme dans les grilles, sur toutes les
// apps du bench.
//
// ⚠️ Comme `pg_link_search`, il se greffe sur une méthode interne de Frappe.
// Après une montée de version, retester : ouvrir un BL et taper vite au Client.

(function () {
	const MARQUE = "__pg_saisie_en_cours";

	// Champs où une valeur venue du serveur ne doit JAMAIS remplacer une frappe en
	// cours. Cas d'origine (2026-10-07) : on choisit un article dans un BL, Entrée,
	// on tape « 105 » dans la Quantité — la réponse du serveur (prix, unité…)
	// arrive une fraction de seconde après et pose sa quantité PAR DÉFAUT, 1, par
	// dessus : l'écran montrait « 1 ». La valeur tapée reste à l'écran, et c'est
	// elle que Frappe enregistre en quittant le champ (événement `change`).
	//
	// ⚠️ Pas les champs texte : sur un Client ou un Article, choisir dans la liste
	// déroulante pose une valeur RÉELLE par programme alors que le champ porte
	// encore la marque de frappe — la bloquer laisserait « you » à l'écran au
	// lieu du client choisi.
	const NUMERIQUES = new Set(["Float", "Int", "Currency", "Percent"]);

	// Une frappe réelle (isTrusted) dans une case la marque ; la quitter efface
	// la marque. Phase de capture : rien ne peut s'interposer avant.
	document.addEventListener(
		"input",
		(e) => {
			if (e.isTrusted && e.target && e.target.tagName === "INPUT") e.target[MARQUE] = true;
		},
		true
	);
	document.addEventListener(
		"focusout",
		(e) => {
			if (e.target) delete e.target[MARQUE];
		},
		true
	);

	// ⚠️ `frappe.ui.form.ControlData` n'est PAS la classe dont héritent les
	// autres contrôles. ERPNext la REMPLACE par une sous-classe (telephony.js :
	// `ControlData = class extends ControlData`), alors que Link, Autocomplete…
	// ont été déclarés avant et héritent de l'ORIGINALE. Patcher le prototype
	// exposé ne touchait donc que les champs Data : le Client (Link) restait
	// effacé. On remonte la chaîne jusqu'au prototype qui DÉFINIT réellement la
	// méthode, et on y pose le garde-fou — tous les héritiers en profitent.
	function proprietaire(proto) {
		while (proto && !Object.prototype.hasOwnProperty.call(proto, "set_formatted_input")) {
			proto = Object.getPrototypeOf(proto);
		}
		return proto;
	}

	function installer() {
		const Data = frappe.ui && frappe.ui.form && frappe.ui.form.ControlData;
		const Link = frappe.ui && frappe.ui.form && frappe.ui.form.ControlLink;
		if (!Data || !Link) return false;
		// Le parent de Link est l'ORIGINALE ; c'est elle (ou son ancêtre) qui
		// porte la méthode appelée par `super.set_formatted_input()`.
		const cible = proprietaire(Object.getPrototypeOf(Link.prototype));
		if (!cible) return false;
		if (cible.__pg_saisie_protegee) return true;

		const origine = cible.set_formatted_input;
		cible.set_formatted_input = function (value) {
			const el = this.$input && this.$input[0];
			if (el && el[MARQUE] && el.value && document.activeElement === el) {
				// Valeur vide : jamais par-dessus une frappe, quel que soit le champ.
				const vide = value === undefined || value === null || value === "";
				if (vide) return;
				// Champ NUMÉRIQUE : aucune valeur, même réelle, tant qu'on y tape.
				if (NUMERIQUES.has(this.df && this.df.fieldtype)) return;
			}
			return origine.apply(this, arguments);
		};
		cible.__pg_saisie_protegee = true;
		return true;
	}

	if (!installer()) {
		$(document).on("app_ready", installer);
		console.warn(
			"[saisie_protegee] ControlData introuvable au chargement, nouvel essai à app_ready"
		);
	}
})();
