"""Un champ sélectionné par le moteur de focus le RESTE quand le code réécrit sa valeur.

Le mécanisme vit uniquement côté client, dans `public/js/pg_focus_grille.bundle.js`
(`_garder`). Ces tests lisent le FICHIER SOURCE, comme ceux de
`pg_defilement_liste`. Ils ne prouvent pas que la Quantité reste sélectionnée —
ce qui a été vérifié à l'écran le 2026-10-30 sur les sept grilles (Retour,
Écriture de stock et Réconciliation donnaient « 1,00123 », « 0,00123 » et
« 120,00123 » en tapant 123) —, mais ils attrapent les façons de le désactiver
sans bruit : ne plus armer la garde après la sélection, ne plus resélectionner
sur une valeur réécrite, ou perdre l'une des conditions qui rendent la main à
l'utilisateur.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from param_global import hooks

BUNDLE = "pg_focus_grille.bundle.js"


class TestGardeSelection(FrappeTestCase):
	@staticmethod
	def _code():
		source = frappe.read_file(frappe.get_app_path("param_global", "public", "js", BUNDLE))
		return "\n".join(l for l in source.splitlines() if not l.lstrip().startswith("//"))

	def test_bundle_charge_sur_tout_le_desk(self):
		self.assertIn(BUNDLE, hooks.app_include_js)

	def test_garde_armee_apres_la_selection(self):
		code = self._code()
		self.assertIn("input.select();\n\t\t\t\tthis._garder(input);", code)

	def test_reselection_sur_valeur_reecrite(self):
		code = self._code()
		self.assertIn("input.value !== garde.valeur", code)
		self.assertIn("GARDE_MS:", code)

	def test_la_main_rendue_a_l_utilisateur(self):
		# Une frappe, une touche, un clic ou la perte du curseur arrêtent la garde :
		# sans ces conditions, elle effacerait ce que l'utilisateur est en train d'écrire.
		code = self._code()
		for condition in (
			"document.activeElement !== input",
			"this._frappe > garde.depuis",
			"this._touche > garde.depuis",
			"this._geste > garde.depuis",
		):
			self.assertIn(condition, code)
		self.assertIn("this._touche = performance.now();", code)
