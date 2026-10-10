"""La barre de défilement horizontal d'une liste reste visible à l'écran.

Le mécanisme vit uniquement côté client, dans
`public/js/pg_defilement_liste.bundle.js`. Ces tests lisent le FICHIER SOURCE,
comme ceux de `pg_ligne_manuelle`. Ils ne prouvent pas que la barre s'affiche —
ce qui a été vérifié à l'écran le 2026-10-10 sur Paiement BL —, mais ils
attrapent les façons de le désactiver sans bruit : retirer le bundle de
`app_include_js`, ne plus se greffer sur le rendu de `ListView`, ou perdre l'une
des deux règles (hauteur bornée, en-tête collant).
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from param_global import hooks

BUNDLE = "pg_defilement_liste.bundle.js"


class TestDefilementListe(FrappeTestCase):
	@staticmethod
	def _code():
		source = frappe.read_file(frappe.get_app_path("param_global", "public", "js", BUNDLE))
		return "\n".join(l for l in source.splitlines() if not l.lstrip().startswith("//"))

	def test_bundle_charge_sur_tout_le_desk(self):
		self.assertIn(BUNDLE, hooks.app_include_js)

	def test_greffe_sur_le_rendu_des_listes(self):
		code = self._code()
		self.assertIn("frappe.views.ListView", code)
		self.assertIn('"render"', code)
		self.assertIn('"render_header"', code)

	def test_hauteur_bornee_et_entete_collant(self):
		code = self._code()
		self.assertIn("scrollWidth > el.clientWidth", code)
		self.assertIn("el.style.maxHeight", code)
		self.assertIn("position: sticky", code)
