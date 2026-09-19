// Une ligne manuelle garde TOUJOURS son article support I00001.
//
// ── Le problème ────────────────────────────────────────────────────────────
// Les cinq formulaires à grille d'articles (BL, Retour, Devis, Bon de Commande,
// Bon de Réception) passent une ligne en saisie libre au double-clic : l'app
// pose `ligne_manuelle = 1` et `item_code = "I00001"`, puis REMPLACE l'input du
// champ Link par un clone inerte où l'on tape la désignation.
//
// Or le contrôle Link d'origine peut avoir une écriture EN ATTENTE. Scénario
// réel (2026-09-18) : on efface le texte de l'article, puis on double-clique.
// Le Link, constatant que sa case a été vidée, écrit `item_code = ""` dans la
// ligne — APRÈS le double-clic, donc par-dessus I00001. L'écran continuait
// d'afficher la désignation (le clone), mais la ligne n'avait plus de code :
// cellule vide au premier Entrée, « Code de l'Article » manquant à
// l'enregistrement, et « Dern. prix achat » remis à 0 par le déclencheur.
//
// ── Le correctif ───────────────────────────────────────────────────────────
// 1. Toute écriture de `item_code` passe par `frappe.model.set_value` (c'est
//    là qu'aboutit `set_model_value` du contrôle). On y refuse, sur une ligne
//    manuelle, toute valeur autre que I00001. Refusée à la source, l'écriture
//    ne déclenche aucun handler : ni fetch ERPNext, ni prix d'achat remis à 0.
//    Le retour au mode recherche (re-double-clic) n'est pas gêné : les apps
//    baissent `ligne_manuelle` AVANT de vider le code.
// 2. Filet à l'enregistrement : `validate` s'exécute avant le contrôle des
//    champs obligatoires ; chaque ligne manuelle y retrouve son code, sa
//    désignation et son unité, quelle que soit la façon dont elle les a perdus.
//
// Un seul endroit pour les cinq formulaires — même règle que `pg_loupes`.

frappe.provide("param_global.ligne_manuelle");

(function () {
	const ARTICLE = "I00001";
	const DOCUMENTS = ["Delivery Note", "Retour", "Quotation", "Purchase Order", "Purchase Receipt"];

	param_global.ligne_manuelle.ARTICLE = ARTICLE;

	// ─── 1. Garde sur l'écriture ─────────────────────────────────────────────
	const est_ligne_manuelle = (doc) => !!(doc && doc.parentfield && cint(doc.ligne_manuelle));

	const set_value_origine = frappe.model.set_value;
	if (!set_value_origine.__pg_ligne_manuelle) {
		frappe.model.set_value = function (doctype, docname, fieldname, value) {
			const doc = $.isPlainObject(doctype) ? doctype : locals[doctype] && locals[doctype][docname];
			if (est_ligne_manuelle(doc)) {
				if ($.isPlainObject(fieldname)) {
					if ("item_code" in fieldname && fieldname.item_code !== ARTICLE) {
						const reste = Object.assign({}, fieldname);
						delete reste.item_code;
						console.warn("[ligne_manuelle] item_code refusé sur une ligne manuelle", doc.idx);
						if (!Object.keys(reste).length) return Promise.resolve();
						arguments[2] = reste;
					}
				} else if (fieldname === "item_code" && value !== ARTICLE) {
					console.warn("[ligne_manuelle] item_code refusé sur une ligne manuelle", doc.idx);
					return Promise.resolve();
				}
			}
			return set_value_origine.apply(this, arguments);
		};
		frappe.model.set_value.__pg_ligne_manuelle = true;
	}

	// ─── 2. Filet à l'enregistrement ─────────────────────────────────────────
	function reparer(frm) {
		(frm.doc.items || []).forEach((row) => {
			if (!cint(row.ligne_manuelle)) return;
			const a = (champ) => frappe.meta.has_field(row.doctype, champ);
			row.item_code = ARTICLE;
			const designation = (row.designation_manuelle || "").trim();
			if (designation && a("item_name")) row.item_name = designation;
			if (a("uom") && !row.uom) row.uom = "Unité";
			if (a("stock_uom") && !row.stock_uom) row.stock_uom = "Unité";
			if (a("conversion_factor") && !flt(row.conversion_factor)) row.conversion_factor = 1;
		});
	}

	DOCUMENTS.forEach((dt) => frappe.ui.form.on(dt, { validate: reparer }));
})();
