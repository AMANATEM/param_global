// Contrôle « vente à perte » — prix de vente inférieur au dernier prix d'achat.
//
// Pendant de `pg_montant_nul`, pour l'autre contrôle de prix posé à la
// validation d'un Bon de Livraison :
//   • un utilisateur ordinaire est REFUSÉ (le serveur refait le contrôle,
//     `param_global/vente_perte.py`) ;
//   • l'Administrateur est AVERTI et tranche lui-même.
//
// ⚠️ Le pictogramme reste 📉 et NON le « 0 » rouge du montant nul. Les deux
// refus tombent au même moment, sur le même bouton : s'ils se ressemblaient, on
// ne saurait plus lequel on vient de lire. C'est délibéré, ne pas
// « harmoniser ».
//
// ⚠️ Le tableau chiffré est rendu en LTR dans les DEUX langues : codes et
// libellés d'articles sont du texte latin, et une colonne de nombres se lit de
// gauche à droite. Même piège que les dates de `controle_date.py::_ltr`, mais
// sur un bloc entier.
//
// ⚠️ Les montants passent par `format_number`, qui honore le réglage global
// « #.###,## » — jamais par une construction à la main. C'est la règle de format
// du CLAUDE.md, et son pendant serveur (`fmt_money`) corrige justement un
// `"{:,.2f}"` en dur qui affichait « 1,292.60 » au lieu de « 1.292,60 ».
//
// La RECHERCHE du prix d'achat n'est pas ici : elle appartient à l'app, qui sait
// où lire le prix de ses articles (`bon_livraison…search.get_prix_achat`). Ce
// module ne reçoit que le verdict déjà calculé.

frappe.provide("param_global.vente_perte");

(function () {
	const ICONE =
		'<div style="text-align:center;font-size:3.2em;line-height:1;margin-bottom:8px">📉</div>';

	function tableau(fautives, entetes, mot_ligne, rtl) {
		const lignes = fautives
			.map(function (x) {
				const nom = x.item_name
					? "<br><span style='color:#888'>" +
					  frappe.utils.escape_html(x.item_name) +
					  "</span>"
					: "";
				return (
					"<tr>" +
					`<td style="padding:3px 8px">${x.idx}</td>` +
					`<td style="padding:3px 8px"><b>${frappe.utils.escape_html(
						x.item_code
					)}</b>${nom}</td>` +
					`<td style="padding:3px 8px;text-align:right">${format_number(
						x.vente,
						null,
						2
					)}</td>` +
					`<td style="padding:3px 8px;text-align:right">${format_number(
						x.achat,
						null,
						2
					)}</td>` +
					`<td style="padding:3px 8px;text-align:right;color:#cc0000"><b>${format_number(
						x.achat - x.vente,
						null,
						2
					)}</b></td>` +
					"</tr>"
				);
			})
			.join("");

		const th = [mot_ligne]
			.concat(entetes)
			.map(
				(libelle, i) =>
					`<th style="padding:3px 8px;text-align:${
						i < 2 ? "left" : "right"
					}">${libelle}</th>`
			)
			.join("");

		return (
			`<table dir="ltr" style="width:100%;border-collapse:collapse;margin-top:6px` +
			`${rtl ? ";text-align:left" : ""}">` +
			`<tr style="background:#f5f5f5;font-size:0.9em">${th}</tr>${lignes}</table>`
		);
	}

	function bloc_fr(fautives, titre, question) {
		return (
			`<div><b>${titre}</b></div>` +
			tableau(fautives, ["Article", "Vente", "Achat", "Perte"], "Ligne", false) +
			(question ? `<div style="margin-top:.6em;font-weight:600">${question}</div>` : "")
		);
	}

	function bloc_ar(fautives, titre, question) {
		return (
			`<div dir="rtl" lang="ar" style="text-align:right;margin-top:.8em;` +
			`padding-top:.8em;border-top:1px solid rgba(0,0,0,.15)">` +
			`<div><b>${titre}</b></div>` +
			`<div style="margin-top:.5em">ثمن البيع أقل من آخر ثمن شراء:</div>` +
			`<span dir="ltr" style="unicode-bidi:isolate">` +
			tableau(fautives, ["المنتج", "البيع", "الشراء", "الخسارة"], "السطر", true) +
			`</span>` +
			(question ? `<div style="margin-top:.6em;font-weight:600">${question}</div>` : "") +
			`</div>`
		);
	}

	// `fautives` — [{ idx, item_code, item_name, vente, achat }], déjà filtré par
	// l'app. Renvoie une promesse : tenue si l'on peut valider, rompue sinon.
	function demander(fautives) {
		if (!fautives || !fautives.length) return Promise.resolve();

		return new Promise(function (resolve, reject) {
			if (frappe.session.user === "Administrator") {
				frappe.confirm(
					ICONE +
						bloc_fr(
							fautives,
							"Avertissement — Vente à perte",
							"Voulez-vous quand même valider ?"
						) +
						bloc_ar(fautives, "تنبيه — بيع بخسارة", "هل تريد المتابعة رغم ذلك؟"),
					resolve,
					reject
				);
				return;
			}

			frappe.msgprint({
				title: "Vente à perte · البيع بخسارة",
				message:
					ICONE +
					bloc_fr(fautives, "Validation impossible — Vente à perte", "") +
					bloc_ar(fautives, "المصادقة غير ممكنة — البيع بخسارة", ""),
				indicator: "red",
			});
			reject();
		});
	}

	param_global.vente_perte = { demander: demander, ICONE: ICONE };
})();
