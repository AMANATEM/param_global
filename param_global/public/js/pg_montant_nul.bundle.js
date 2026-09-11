// Contrôle « montant nul » — Bon de Livraison, Bon de Réception, Devis.
//
// Une ligne à 0,00 dans un document commercial est presque toujours une erreur
// de saisie : article choisi sans prix, remise de 100 % tapée par accident,
// quantité oubliée. ERPNext, lui, l'accepte sans broncher.
//
// Deux comportements, selon qui valide :
//   • un utilisateur ordinaire est REFUSÉ (le serveur refait le contrôle) ;
//   • l'Administrateur est AVERTI et tranche lui-même.
//
// ⚠️ CE BLOC VIVAIT EN TROIS EXEMPLAIRES rigoureusement identiques, dans
// `bon_livraison/delivery_note.js`, `bon_reception/purchase_receipt.js` et
// `devis/quotation.js` (constaté le 2026-09-11 : même code au caractère près).
// C'est exactement le mécanisme qui a produit les dix-sept copies divergentes
// des loupes de colonne, dont une portait une faute que personne n'a vue
// pendant des mois. Il vit désormais ici, et nulle part ailleurs.
//
// ⚠️ Le grand « 0 » ROUGE remplace le triangle jaune ⚠️ des deux côtés (demande
// utilisateur du 2026-09-11). Le triangle est le pictogramme générique de tous
// les avertissements du desk : il ne disait pas DE QUOI il s'agissait. Un zéro
// rouge plein cadre nomme le problème avant même qu'on lise le texte — et c'est
// le même repère que l'on soit averti ou refusé, puisque c'est le même défaut.
//
// ⚠️ La vente à perte (`bl_check_prix_sous_achat`) garde volontairement un
// visuel DIFFÉRENT — flèche descendante orange et tableau chiffré : deux refus
// qui se ressemblent au premier coup d'œil se confondent.

frappe.provide("param_global.montant_nul");

(function () {
	// Le zéro plein cadre. Même taille dans les deux cas : l'avertissement et le
	// refus portent sur le même défaut, seul le texte change.
	const ZERO_ROUGE =
		'<div style="text-align:center;font-size:3.5em;font-weight:900;color:#cc0000;' +
		'line-height:1;margin-bottom:10px">0</div>';

	// Isole un nombre dans un texte arabe : sans cela l'algorithme bidirectionnel
	// réordonne les chiffres à l'affichage. Même piège que `controle_date.py::_ltr`.
	function ltr(contenu) {
		return `<span dir="ltr" style="unicode-bidi:isolate">${contenu}</span>`;
	}

	// La liste des lignes fautives. Le code et le libellé de l'article sont du
	// texte latin : la liste est donc rendue en LTR dans les deux langues, seul
	// le mot « Ligne » change.
	function liste(zero_items, mot_ligne, rtl) {
		const puces = zero_items
			.map(function (i) {
				const code = frappe.utils.escape_html(i.item_code || "");
				const nom = i.item_name ? " / " + frappe.utils.escape_html(i.item_name) : "";
				return `<li>${mot_ligne} ${i.idx} — <b>${code}</b>${nom}</li>`;
			})
			.join("");
		return (
			`<ul dir="ltr" style="margin:6px 0 0 16px${rtl ? ";text-align:left" : ""}">` +
			`${puces}</ul>`
		);
	}

	function bloc_fr(zero_items, titre, question) {
		return (
			`<div><b>${titre}</b></div>` +
			`<div style="margin-top:.5em">Les produits suivants ont un montant de 0 :</div>` +
			liste(zero_items, "Ligne", false) +
			(question ? `<div style="margin-top:.6em;font-weight:600">${question}</div>` : "")
		);
	}

	function bloc_ar(zero_items, titre, question) {
		return (
			`<div dir="rtl" lang="ar" style="text-align:right;margin-top:.8em;` +
			`padding-top:.8em;border-top:1px solid rgba(0,0,0,.15)">` +
			`<div><b>${titre}</b></div>` +
			`<div style="margin-top:.5em">المنتجات التالية مبلغها صفر:</div>` +
			ltr(liste(zero_items, "السطر", true)) +
			(question ? `<div style="margin-top:.6em;font-weight:600">${question}</div>` : "") +
			`</div>`
		);
	}

	// Renvoie une promesse : tenue si l'on peut valider, rompue sinon. C'est le
	// contrat attendu par les `before_submit` des trois formulaires.
	//
	// `frm` — le formulaire. Les apps filtrent en amont ce qui ne les concerne
	// pas (le Bon E/S côté `bon_reception`, par exemple) : cette connaissance-là
	// leur appartient et n'a rien à faire ici.
	function controler(frm) {
		const zero_items = (frm.doc.items || []).filter((i) => !i.amount || i.amount === 0);
		if (!zero_items.length) return Promise.resolve();

		return new Promise(function (resolve, reject) {
			if (frappe.session.user === "Administrator") {
				frappe.confirm(
					ZERO_ROUGE +
						bloc_fr(
							zero_items,
							"Avertissement — Montant nul",
							"Voulez-vous quand même valider ?"
						) +
						bloc_ar(zero_items, "تنبيه — مبلغ صفري", "هل تريد المتابعة رغم ذلك؟"),
					resolve,
					reject
				);
				return;
			}

			frappe.msgprint({
				title: "Validation impossible · المصادقة غير ممكنة",
				message:
					ZERO_ROUGE +
					bloc_fr(zero_items, "Validation impossible — Montant nul", "") +
					bloc_ar(zero_items, "المصادقة غير ممكنة — مبلغ صفري", ""),
				indicator: "red",
			});
			reject();
		});
	}

	param_global.montant_nul = { controler: controler, ZERO_ROUGE: ZERO_ROUGE };
})();
