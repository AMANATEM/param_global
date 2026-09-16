"""Présentation des grilles imposée à tous les utilisateurs (`grilles.py`)."""

from frappe.tests.utils import FrappeTestCase

from param_global.grilles import GRILLES


class TestGrilles(FrappeTestCase):
	def test_largeur_totale_au_plus_dix(self):
		# Au-delà, grid.js abandonne le rendu personnalisé et une colonne
		# disparaît en silence.
		for parent, tables in GRILLES.items():
			for table, colonnes in tables.items():
				total = sum(largeur for _champ, largeur in colonnes)
				self.assertLessEqual(total, 10, f"{parent} / {table} : {total}")

	def test_bon_commande_porte_l_unite(self):
		colonnes = GRILLES["Purchase Order"]["Purchase Order Item"]
		self.assertEqual(
			colonnes,
			[("item_code", 2), ("qty", 1), ("uom", 1), ("rate", 1), ("amount", 2)],
		)
