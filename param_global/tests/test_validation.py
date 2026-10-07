"""« Validé le » : `param_global` décide seul de son ancrage (ANCRAGES_SPECIFIQUES)."""

from frappe.tests.utils import FrappeTestCase

from param_global import validation


class TestAncrageValidation(FrappeTestCase):
	def test_bon_de_reception_sous_l_heure(self):
		"""2026-10-03 : 2e colonne, sous la date et l'heure — « Créé par » est
		parti en tête de la 3e colonne (`bon_reception`)."""
		self.assertEqual(validation._ancrage("Purchase Receipt"), "set_posting_time")

	def test_l_ancrage_par_defaut_reste_cree_par(self):
		self.assertEqual(validation._ancrage("Purchase Order"), "transaction_date")
		self.assertEqual(validation._ancrage("Delivery Note"), "customer")
