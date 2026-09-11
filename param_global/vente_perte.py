"""Le refus serveur « vente à perte », bilingue — prix de vente < prix d'achat.

Pendant de `param_global.montant_nul`, pour l'autre contrôle de prix posé à la
validation d'un Bon de Livraison. Même partage des rôles : l'Administrateur est
averti à l'écran et tranche, un utilisateur ordinaire est refusé, et c'est ici.

⚠️ **C'est CE refus qui bloque réellement.** Le dialogue du navigateur n'est
qu'un confort : la méthode de validation s'appelle depuis la console.

⚠️ Le message est BILINGUE français + arabe, comme `controle_date` et
`montant_nul`, et pour la même raison : le refus est sans recours pour la
personne au comptoir, elle doit comprendre du premier coup ce qu'il faut
corriger.

⚠️ Le pictogramme reste 📉 et NON le « 0 » rouge du montant nul. Les deux refus
tombent au même moment, sur le même bouton : s'ils se ressemblaient, on ne
saurait plus lequel on vient de lire. C'est délibéré, ne pas « harmoniser ».

⚠️ **Les montants passent par `fmt_money`, JAMAIS par un format Python.** Le code
d'origine écrivait `"{:,.2f}"`, c'est-à-dire le format ANGLAIS : une perte de
1 292,60 DH s'affichait « 1,292.60 ». Le même chiffre était donc écrit de deux
façons selon qui validait, puisque le client, lui, utilisait déjà
`format_number`. `fmt_money` lit `System Settings.number_format` (« #.###,## »,
posé par `install.apply_global_params`) et rend « 1.292,60 ». Constaté et
corrigé le 2026-09-11.
"""

import frappe
from frappe import _
from frappe.utils import fmt_money

#: La flèche descendante, jumelle de `ICONE` dans pg_vente_perte.bundle.js.
ICONE = (
	'<div style="text-align:center;font-size:3.2em;line-height:1;margin-bottom:8px">📉</div>'
)


def _tableau(fautives, entetes, mot_ligne, rtl=False):
	"""Le tableau chiffré Ligne / Article / Vente / Achat / Perte.

	Rendu en LTR dans les deux langues : codes et libellés d'articles sont du
	texte latin, et une colonne de nombres se lit de gauche à droite. Même piège
	que les dates de `controle_date.py::_ltr`, mais sur un bloc entier.
	"""
	lignes = "".join(
		"<tr>"
		'<td style="padding:3px 8px">{idx}</td>'
		'<td style="padding:3px 8px"><b>{code}</b>{nom}</td>'
		'<td style="padding:3px 8px;text-align:right">{vente}</td>'
		'<td style="padding:3px 8px;text-align:right">{achat}</td>'
		'<td style="padding:3px 8px;text-align:right;color:#cc0000"><b>{perte}</b></td>'
		"</tr>".format(
			idx=item.idx,
			code=frappe.utils.escape_html(item.item_code or ""),
			nom=(
				"<br><span style='color:#888'>{}</span>".format(
					frappe.utils.escape_html(item.item_name)
				)
				if item.item_name
				else ""
			),
			vente=fmt_money(vente),
			achat=fmt_money(achat),
			perte=fmt_money(achat - vente),
		)
		for item, achat, vente in fautives
	)
	th = "".join(
		'<th style="padding:3px 8px;text-align:{}">{}</th>'.format(
			"left" if i < 2 else "right", libelle
		)
		for i, libelle in enumerate([mot_ligne] + list(entetes))
	)
	align = ";text-align:left" if rtl else ""
	return (
		'<table dir="ltr" style="width:100%;border-collapse:collapse;margin-top:6px{}">'
		'<tr style="background:#f5f5f5;font-size:0.9em">{}</tr>{}</table>'.format(align, th, lignes)
	)


def refuser(fautives):
	"""Lève le refus bilingue.

	`fautives` — une liste de triplets `(ligne, prix_achat, prix_vente)`, telle
	que la produit `bon_livraison.delivery_note.lignes_sous_prix_achat`.
	"""
	fr = (
		"<div><b>Validation impossible — Vente à perte</b></div>"
		+ _tableau(fautives, ("Article", "Vente", "Achat", "Perte"), "Ligne")
	)
	ar = (
		'<div dir="rtl" lang="ar" style="text-align:right;margin-top:.8em;'
		'padding-top:.8em;border-top:1px solid rgba(0,0,0,.15)">'
		"<div><b>المصادقة غير ممكنة — البيع بخسارة</b></div>"
		'<div style="margin-top:.5em">ثمن البيع أقل من آخر ثمن شراء:</div>'
		'<span dir="ltr" style="unicode-bidi:isolate">'
		+ _tableau(fautives, ("المنتج", "البيع", "الشراء", "الخسارة"), "السطر", rtl=True)
		+ "</span></div>"
	)
	frappe.throw(
		ICONE + fr + ar,
		title=_("Vente à perte · البيع بخسارة"),
	)
