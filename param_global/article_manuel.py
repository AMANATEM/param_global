# L'article support des lignes manuelles vaut TOUJOURS zéro.
#
# `I00001` (« Article support des lignes manuelles hors catalogue ») porte le
# texte libre d'une ligne saisie au double-clic dans les sept grilles du bench :
# BL, Retour, Devis, Bon de Commande, Bon de Réception, Écriture et
# Réconciliation de Stock. Chaque ligne manuelle a son propre libellé et son
# propre montant — un chariot à 111,80 aujourd'hui, une main-d'œuvre à 350,00
# demain. **Un tarif sur cet article ne veut donc rien dire.**
#
# Ce module garantit une seule chose, et elle suffit : quel que soit le montant
# saisi sur une ligne manuelle, **le tarif de `I00001` reste à 0,00 sur toutes
# les listes de prix**. Le prix proposé à la ligne manuelle suivante est donc
# vide, et c'est l'utilisateur qui le saisit — ce qui est le comportement voulu.
#
# ── Ce que le Bon de Réception faisait ──────────────────────────────────────
#
# `Stock Settings.auto_insert_price_list_rate_if_missing` vaut 1 : ERPNext crée
# un `Item Price` de lui-même pour tout article vendu ou acheté sans tarif connu.
# Et ce n'est PAS seulement au moment où l'on choisit l'article à l'écran :
# `insert_item_price` est appelé **côté serveur, depuis le `validate` du
# Purchase Receipt** — `set_missing_item_details` → `get_price_list_rate` →
# `insert_item_price` (trace relevée le 2026-09-11). Chaque BR portant une ligne
# manuelle gravait donc son montant du jour dans les trois tarifs de vente.
# Constaté en base : 111,80 en vente ×3 et 20,00 en achat.
#
# ⚠️ `bon_reception` écartait pourtant déjà `I00001` de SES propres écritures de
# prix (`purchase_receipt._taux_par_article`). Le trou n'était pas là : il était
# dans le mécanisme natif d'ERPNext, que personne ne regardait.
#
# ── Pourquoi FORCER À ZÉRO et non REFUSER ───────────────────────────────────
#
# ⚠️⚠️ Une première version de ce module levait une exception sur toute création
# d'`Item Price` visant `I00001`. **C'était dangereux, et il ne faut pas y
# revenir.** `insert_item_price()` n'est protégé par aucun `try/except` chez son
# appelant (`get_item_details.py:943`), et cet appelant est le `validate` du Bon
# de Réception : un refus n'y bloque pas le tarif, il **fait échouer
# l'enregistrement du BR tout entier**. Pris sur le fait le 2026-09-11 sur un BR
# de test, avant toute mise en production.
#
# Forcer la valeur, au contraire, ne peut rien casser : le document s'enregistre,
# la ligne de tarif existe, elle vaut simplement 0,00. Aucun chemin d'appel n'a
# besoin d'être connu à l'avance — c'est la propriété recherchée qui est tenue,
# pas la liste des façons de l'enfreindre.
#
# ⚠️ Corollaire : ce module n'a plus besoin d'être « appliqué » (il n'y a plus de
# monkey-patch, donc plus de `before_request` / `before_job`). Un hook de
# document est branché une fois pour toutes par `hooks.py` et ne peut pas
# manquer à l'appel dans un worker.

import frappe

#: L'article support des lignes manuelles. Le même code est redéclaré dans
#: `bon_livraison`, `devis`, `bon_commande` et `bon_reception` — chacune y tient
#: son propre repère métier ; celle-ci porte la règle transverse du tarif.
ARTICLE_MANUEL = "I00001"


def forcer_a_zero(doc, method=None):
	"""Hook `validate` sur `Item Price` : le tarif de l'article support vaut 0.

	Ne lève JAMAIS d'exception — voir l'encadré « Pourquoi forcer à zéro » en
	tête de module. Vaut pour toutes les listes de prix, vente comme achat : un
	prix d'achat sur un porte-texte n'a pas plus de sens qu'un prix de vente, et
	c'est lui qui pré-remplissait la ligne manuelle du Bon de Réception suivant.
	"""
	if doc.item_code == ARTICLE_MANUEL:
		doc.price_list_rate = 0


def purger_tarifs():
	"""Supprime tout `Item Price` portant sur l'article support.

	Le hook ci-dessus suffit à garantir le zéro ; cette purge enlève en plus les
	lignes devenues inutiles — dont les quatre héritées d'avant ce correctif.

	Rejouée à CHAQUE migrate (et non posée en patch one-shot) : c'est la même
	raison que `bon_es.backfill_type_operation()`. Une ligne recréée entre-temps
	par le mécanisme natif d'ERPNext doit repartir, et il n'y a rien à conserver
	— elle vaut 0,00 par construction.

	⚠️ Les documents déjà enregistrés ne sont PAS touchés : le prix d'une ligne
	de BL ou de BR vit sur la ligne, pas dans le tarif. Un document ancien garde
	donc à l'impression le montant qui a réellement été facturé.
	"""
	noms = frappe.get_all("Item Price", filters={"item_code": ARTICLE_MANUEL}, pluck="name")
	if not noms:
		return 0

	for nom in noms:
		frappe.delete_doc("Item Price", nom, force=True, ignore_permissions=True)
	frappe.db.commit()
	return len(noms)
