"""Une ligne manuelle garde toujours son article support I00001.

La garde vit uniquement côté client, dans
`public/js/pg_ligne_manuelle.bundle.js` : c'est le contrôle Link du navigateur
qui écrivait `item_code = ""` par-dessus I00001 après le double-clic, et le
contrôle des champs obligatoires qui refusait ensuite l'enregistrement — deux
étapes qui n'existent pas côté serveur.

Ces tests lisent le FICHIER SOURCE, comme ceux de `pg_doublon_article`. Ils ne
prouvent pas que la garde fonctionne — ce qui a été vérifié à l'écran le
2026-09-18 —, mais ils attrapent les trois façons de la désactiver sans bruit :
retirer le bundle de `app_include_js`, supprimer le filet d'enregistrement, ou
oublier l'un des cinq documents.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from param_global import hooks

BUNDLE = "pg_ligne_manuelle.bundle.js"
DOCUMENTS = ("Delivery Note", "Retour", "Quotation", "Purchase Order", "Purchase Receipt")


class TestLigneManuelle(FrappeTestCase):
	@staticmethod
	def _code():
		source = frappe.read_file(frappe.get_app_path("param_global", "public", "js", BUNDLE))
		return "\n".join(l for l in source.splitlines() if not l.lstrip().startswith("//"))

	def test_bundle_charge_sur_tout_le_desk(self):
		self.assertIn(BUNDLE, hooks.app_include_js)

	def test_garde_sur_set_value(self):
		"""La garde se pose sur `frappe.model.set_value`, point de passage de
		`set_model_value` — et nulle part ailleurs ne l'intercepterait."""
		code = self._code()
		self.assertIn("frappe.model.set_value = function", code)
		self.assertIn('"I00001"', code)
		self.assertIn("ligne_manuelle", code)

	def test_filet_sur_les_cinq_documents(self):
		code = self._code()
		for dt in DOCUMENTS:
			self.assertIn(f'"{dt}"', code, dt)
		self.assertIn("validate: reparer", code)
