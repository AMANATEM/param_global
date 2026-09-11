"""L'article support des lignes manuelles ne porte jamais de tarif ≠ 0.

⚠️ Ces tests protègent une règle dont la VIOLATION EST SILENCIEUSE : un tarif
gravé sur `I00001` ne casse rien, il pré-remplit simplement la ligne manuelle
suivante avec un montant sans rapport. C'est resté en production jusqu'au
2026-09-11 (111,80 sur les trois tarifs de vente, 20,00 en achat).

⚠️ Le garde-fou FORCE la valeur à 0, il ne refuse pas l'écriture — et c'est le
cœur de ce qu'il faut protéger. Une version antérieure levait une exception :
comme `insert_item_price()` est appelé depuis le `validate` du Purchase Receipt
et n'est protégé par aucun `try/except`, cela faisait échouer l'enregistrement du
BR tout entier. Le test `test_creation_ne_leve_jamais` est là pour que personne
ne réintroduise le refus.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from param_global.article_manuel import ARTICLE_MANUEL, forcer_a_zero, purger_tarifs

from .utils import utilisateur_reel

TARIF_TEST = "_Test Tarif Article Manuel"


class TestArticleManuel(FrappeTestCase):
	def setUp(self):
		if not frappe.db.exists("Price List", TARIF_TEST):
			frappe.get_doc(
				{
					"doctype": "Price List",
					"price_list_name": TARIF_TEST,
					"currency": "MAD",
					"selling": 1,
					"buying": 1,
					"enabled": 1,
				}
			).insert(ignore_permissions=True)
		purger_tarifs()

	def _creer_tarif(self, rate):
		return frappe.get_doc(
			{
				"doctype": "Item Price",
				"item_code": ARTICLE_MANUEL,
				"price_list": TARIF_TEST,
				"price_list_rate": rate,
			}
		).insert(ignore_permissions=True)

	# ── Le forçage lui-même ─────────────────────────────────────────────────

	def test_creation_forcee_a_zero(self):
		self.assertEqual(self._creer_tarif(777.0).price_list_rate, 0)

	def test_mise_a_jour_forcee_a_zero(self):
		"""Le hook est sur `validate` et non `before_insert` : une RÉÉCRITURE
		d'un tarif existant doit être ramenée à zéro elle aussi."""
		doc = self._creer_tarif(111.80)
		doc.price_list_rate = 555.0
		doc.save(ignore_permissions=True)
		self.assertEqual(doc.price_list_rate, 0)

	def test_creation_ne_leve_jamais(self):
		"""⚠️ NE JAMAIS transformer ce forçage en refus.

		`insert_item_price()` d'ERPNext est appelé depuis le `validate` du
		Purchase Receipt et n'est protégé par AUCUN `try/except` : une exception
		y ferait échouer l'enregistrement du BR entier, pas seulement le tarif.
		"""
		with utilisateur_reel():
			self._creer_tarif(999.0)  # ne doit rien lever

	def test_autre_article_intact(self):
		"""Le forçage ne vaut que pour l'article support."""
		autre = frappe.db.get_value(
			"Item", {"disabled": 0, "name": ["!=", ARTICLE_MANUEL]}, "name"
		)
		doc = frappe.get_doc(
			{
				"doctype": "Item Price",
				"item_code": autre,
				"price_list": TARIF_TEST,
				"price_list_rate": 42.5,
			}
		).insert(ignore_permissions=True)
		self.assertEqual(doc.price_list_rate, 42.5)

	def test_hook_appelable_directement(self):
		doc = frappe._dict(item_code=ARTICLE_MANUEL, price_list_rate=1234.0)
		forcer_a_zero(doc)
		self.assertEqual(doc.price_list_rate, 0)

	# ── La purge ────────────────────────────────────────────────────────────

	def test_purge_supprime_tout(self):
		self._creer_tarif(0)
		self.assertTrue(frappe.db.exists("Item Price", {"item_code": ARTICLE_MANUEL}))
		purger_tarifs()
		self.assertFalse(frappe.db.exists("Item Price", {"item_code": ARTICLE_MANUEL}))

	def test_purge_idempotente(self):
		"""Rejouée à chaque migrate : elle doit rester sans effet sur rien."""
		purger_tarifs()
		self.assertEqual(purger_tarifs(), 0)
