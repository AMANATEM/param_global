"""Date et heure de VALIDATION des documents — le champ « Validé le ».

Pourquoi un champ dédié plutôt que `posting_time` : ce dernier est la date de
**comptabilisation**. Il pilote le Stock Ledger et la valorisation, et il est
éditable — un document peut être saisi un jour et validé un autre. Le détourner
pour répondre à « quand a-t-on validé ? » aurait mêlé deux informations qui ne
se recouvrent pas, et fait porter un risque comptable à un besoin d'affichage.

Le champ est posé ICI et non dans chacune des neuf apps concernées : il couvre
treize doctypes et n'appartient à aucun domaine. `param_global` est l'app des
paramètres transverses.

⚠️ Le mécanisme n'est pas nouveau : `bon_es` le portait déjà pour les seuls
Bons E/S, avec le même nom de champ. Cette version le généralise et en devient
**propriétaire** — sans quoi les deux apps se seraient réécrit la définition du
champ à chaque `bench migrate`, chacune selon l'ordre des hooks (le piège déjà
connu sur les grilles, cf. `grilles.py`).

⚠️ Rien n'est rétro-rempli. `tabVersion` conserve pourtant la trace du passage
`docstatus 0 → 1` pour 99,7 % des BL, mais 94 % de ces traces datent des
fenêtres d'import Omag (09/07 → 06/08/2026) : ce sont des heures d'IMPORT, pas
de validation. Un champ vide sur l'historique dit la vérité — ces documents
n'ont jamais été validés dans ERPNext, ils y sont entrés déjà validés.
"""

import frappe
from frappe.utils import now_datetime

CHAMP = "date_validation"

# Les treize doctypes soumissionnables du bench. `Absence Commercial` et
# `Reprise Commission` n'en sont pas et n'ont donc rien à valider.
DOCTYPES = (
	"Delivery Note",
	"Retour",
	"Paiement BL",
	"Purchase Receipt",
	"Paiement BR",
	"Quotation",
	"Purchase Order",
	"Stock Entry",
	"Stock Reconciliation",
	"Remise Bancaire",
	"Mouvement Caisse",
	"Verification",
	"Ajustement Commission",
)

# Points d'ancrage possibles, du plus souhaitable au plus neutre. `cree_par` met
# « Validé le » juste à côté de « Créé par », les deux informations se lisant
# ensemble ; `amended_from` est le repli.
ANCRAGES = ("cree_par", "amended_from")

# Placement voulu au cas par cas, quand le repère par défaut ne convient pas.
# ⚠️ C'est ICI qu'on déplace le champ, et nulle part ailleurs : `insert_after`
# n'a qu'un propriétaire. Une autre app qui le réécrirait dans son propre
# `after_migrate` entrerait en bagarre avec celui-ci à chaque migration, le
# dernier hook exécuté l'emportant.
ANCRAGES_SPECIFIQUES = {
	# Bon de Livraison : sous « Client », à gauche. La colonne de droite
	# (Créé par) est déjà la plus chargée du formulaire, et la gauche n'a que
	# le client — « Validé le » y comble un vide au lieu d'allonger une pile.
	"Delivery Note": "customer",
	# Paiement BL et Paiement BR n'ont PLUS d'exception depuis le 2026-09-06 :
	# ils ont reçu un champ `cree_par`, qui est justement l'ancrage par défaut.
	# Les y laisser ancrés sur « Heure » ferait se disputer la même place à deux
	# champs, l'ordre dépendant alors de celui des hooks.
	# Devis et Bon de Commande : 2e colonne, sous la Date — « Créé par » ayant été
	# déplacé en 3e colonne, l'ancrage par défaut (`cree_par`) l'y aurait entraîné.
	"Quotation": "transaction_date",
	"Purchase Order": "transaction_date",
}


def _ancrage(doctype):
	"""Premier ancrage réellement présent sur ce doctype, ou None.

	Résolu à l'exécution plutôt que figé dans une table : un `insert_after` qui
	désigne un champ absent est silencieusement ignoré par Frappe, et la table
	se périmerait au premier champ renommé.
	"""
	meta = frappe.get_meta(doctype)
	voulu = ANCRAGES_SPECIFIQUES.get(doctype)
	if voulu and meta.get_field(voulu):
		return voulu
	for nom in ANCRAGES:
		if meta.get_field(nom):
			return nom
	return None


def creer_champs():
	"""Pose (ou met à jour) le champ sur les treize doctypes. Idempotent."""
	for doctype in DOCTYPES:
		if not frappe.db.exists("DocType", doctype):
			continue

		definition = {
			"dt": doctype,
			"fieldname": CHAMP,
			"fieldtype": "Datetime",
			"label": "Validé le",
			# Jamais saisi à la main, et jamais recopié sur un duplicata ou une
			# nouvelle version : la validation appartient à UN document.
			"read_only": 1,
			"no_copy": 1,
			# Invisible tant qu'il est vide, donc absent des brouillons et de
			# tout l'historique — il n'apparaît qu'une fois le document validé.
			"depends_on": "eval:doc.%s" % CHAMP,
			# Pas de colonne par défaut dans les listes, mais le champ reste
			# proposé dans « Ajouter une colonne » le jour où on en a besoin.
			"in_list_view": 0,
			"print_hide": 1,
			"insert_after": _ancrage(doctype),
		}

		nom = "%s-%s" % (doctype, CHAMP)
		if frappe.db.exists("Custom Field", nom):
			doc = frappe.get_doc("Custom Field", nom)
			doc.update(definition)
			doc.save(ignore_permissions=True)
		else:
			frappe.get_doc({"doctype": "Custom Field", **definition}).insert(
				ignore_permissions=True
			)

		_masquer_fuseau(doctype)

	frappe.db.commit()


def _masquer_fuseau(doctype):
	"""Supprime la mention « Africa/Casablanca » sous le champ.

	Le contrôle Datetime de Frappe (frappe/form/controls/datetime.js) ajoute le
	fuseau du site en DESCRIPTION du champ, sauf si `hide_timezone` est vrai.
	L'instance est mono-fuseau : la mention n'apprend rien et alourdit la lecture.

	⚠️ `hide_timezone` n'existe PAS comme colonne de « Custom Field » — le mettre
	dans la définition ci-dessus serait ignoré en silence. Il faut passer par un
	Property Setter : `Meta.apply_property_setters()` pose la propriété sur le
	docfield même quand elle ne fait pas partie du schéma (vérifié : elle ressort
	bien dans la meta).
	"""
	from frappe.custom.doctype.property_setter.property_setter import make_property_setter

	make_property_setter(
		doctype, CHAMP, "hide_timezone", 1, "Check", for_doctype=False
	)


def on_submit(doc, method=None):
	"""Horodate la validation.

	`update_modified=False` : `modified` est le tri par défaut des listes
	Frappe, le remuer ferait remonter en tête tout document validé.
	"""
	frappe.db.set_value(
		doc.doctype, doc.name, CHAMP, now_datetime(), update_modified=False
	)


def on_cancel(doc, method=None):
	"""Une annulation efface le visa : le document n'est plus validé."""
	frappe.db.set_value(doc.doctype, doc.name, CHAMP, None, update_modified=False)
