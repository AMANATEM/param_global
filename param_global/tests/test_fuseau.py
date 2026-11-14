"""Le fuseau de l'instance : `Africa/Abidjan` (+00), système ET utilisateurs."""

import frappe
from frappe.tests.utils import FrappeTestCase

from param_global.fuseau import ANCIEN, FUSEAU, appliquer_fuseau


class TestFuseau(FrappeTestCase):
	def setUp(self):
		# On part de l'état d'avant le correctif : tout sur Casablanca.
		frappe.db.set_single_value("System Settings", "time_zone", ANCIEN)
		frappe.db.set_default("time_zone", ANCIEN)
		frappe.db.set_value("User", "Administrator", "time_zone", ANCIEN)

	def tearDown(self):
		appliquer_fuseau()

	def test_systeme_et_utilisateurs_passent_sur_abidjan(self):
		appliquer_fuseau()
		self.assertEqual(frappe.db.get_single_value("System Settings", "time_zone"), FUSEAU)
		self.assertEqual(frappe.db.get_default("time_zone"), FUSEAU)
		self.assertEqual(frappe.db.get_value("User", "Administrator", "time_zone"), FUSEAU)
		self.assertFalse(frappe.db.exists("User", {"time_zone": ANCIEN}))
		self.assertFalse(frappe.db.exists("DefaultValue", {"defkey": "time_zone", "defvalue": ANCIEN}))

	def test_un_autre_fuseau_choisi_n_est_pas_touche(self):
		frappe.db.set_value("User", "Guest", "time_zone", "Europe/Paris")
		appliquer_fuseau()
		self.assertEqual(frappe.db.get_value("User", "Guest", "time_zone"), "Europe/Paris")

	def test_idempotent(self):
		appliquer_fuseau()
		appliquer_fuseau()
		self.assertEqual(frappe.db.get_single_value("System Settings", "time_zone"), FUSEAU)
