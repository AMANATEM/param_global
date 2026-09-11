"""Le refus serveur « montant nul », bilingue — BL, BR et Devis.

Une ligne à 0,00 dans un document commercial est presque toujours une erreur de
saisie. L'Administrateur est simplement averti (côté client, dans
`pg_montant_nul.bundle.js`) ; un utilisateur ordinaire est refusé, et c'est ici.

⚠️ **C'est CE refus qui bloque réellement.** Le dialogue du navigateur n'est
qu'un confort : la méthode de validation s'appelle depuis la console, et un
import n'ouvre aucun formulaire.

⚠️ Le message est BILINGUE français + arabe, comme les refus de `controle_date`
et pour la même raison : une partie des utilisateurs du comptoir lit mieux
l'arabe, et ce refus est **sans recours de leur part** — ils doivent comprendre
du premier coup ce qu'il faut corriger.

⚠️ Le grand « 0 » rouge est le même repère qu'à l'écran (`ZERO_ROUGE` du
bundle) : averti ou refusé, c'est le même défaut, donc le même pictogramme. Le
triangle jaune générique a été retiré des deux côtés le 2026-09-11.

⚠️ Les trois apps appelaient chacune leur propre copie de ce message, identique
au caractère près. Comme le contrôle côté client, il vit désormais ici et nulle
part ailleurs.
"""

import frappe
from frappe import _

#: Le zéro plein cadre, jumeau de `ZERO_ROUGE` dans pg_montant_nul.bundle.js.
ZERO_ROUGE = (
	'<div style="text-align:center;font-size:3.5em;font-weight:900;color:#cc0000;'
	'line-height:1;margin-bottom:10px">0</div>'
)


def _liste(zero_items, mot_ligne, rtl=False):
	"""Les lignes fautives, toujours rendues en LTR.

	Le code et le libellé d'un article sont du texte latin : les poser dans un
	paragraphe arabe les ferait réordonner par l'algorithme bidirectionnel —
	même piège que les dates de `controle_date.py::_ltr`, mais sur un bloc.
	"""
	puces = "".join(
		"<li>{} {} — <b>{}</b>{}</li>".format(
			mot_ligne,
			item.idx,
			frappe.utils.escape_html(item.item_code or ""),
			" / " + frappe.utils.escape_html(item.item_name) if item.item_name else "",
		)
		for item in zero_items
	)
	align = ";text-align:left" if rtl else ""
	return f'<ul dir="ltr" style="margin:6px 0 0 16px{align}">{puces}</ul>'


def refuser(zero_items):
	"""Lève le refus bilingue. À appeler depuis le `validate` des trois apps."""
	fr = (
		"<div><b>Validation impossible — Montant nul</b></div>"
		'<div style="margin-top:.5em">Les produits suivants ont un montant de 0 :</div>'
		+ _liste(zero_items, "Ligne")
	)
	ar = (
		'<div dir="rtl" lang="ar" style="text-align:right;margin-top:.8em;'
		'padding-top:.8em;border-top:1px solid rgba(0,0,0,.15)">'
		"<div><b>المصادقة غير ممكنة — مبلغ صفري</b></div>"
		'<div style="margin-top:.5em">المنتجات التالية مبلغها صفر:</div>'
		'<span dir="ltr" style="unicode-bidi:isolate">'
		+ _liste(zero_items, "السطر", rtl=True)
		+ "</span></div>"
	)
	frappe.throw(
		ZERO_ROUGE + fr + ar,
		title=_("Validation impossible · المصادقة غير ممكنة"),
	)
