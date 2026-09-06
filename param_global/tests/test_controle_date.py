"""Le verrou chronologique — la fenêtre [J+0, J+1] pour valider, [J+0, ∞[ pour annuler.

⚠️ Aucun des 26 tests de cycle de vie n'exerce ce verrou : `in_test` le désactive,
comme pour un `bench migrate`. C'est ici, et seulement ici, qu'il est réellement
éprouvé — d'où le passage par `utilisateur_reel()`.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today

from param_global.controle_date import (
	DOCUMENTS,
	LIMITE_FUTUR_JOURS,
	verifier_date_annulation,
	verifier_date_validation,
)

from .utils import utilisateur_reel


class TestControleDate(FrappeTestCase):
	# ── Validation ──────────────────────────────────────────────────────────

	def test_validation_hier_refusee(self):
		with utilisateur_reel():
			with self.assertRaises(frappe.ValidationError):
				verifier_date_validation(add_days(today(), -1), "bl")

	def test_validation_aujourdhui_acceptee(self):
		with utilisateur_reel():
			verifier_date_validation(today(), "bl")  # ne doit rien lever

	def test_validation_demain_acceptee(self):
		"""La borne haute autorise demain : la livraison se prépare la veille au soir."""
		with utilisateur_reel():
			verifier_date_validation(add_days(today(), LIMITE_FUTUR_JOURS), "bl")

	def test_validation_apres_demain_refusee(self):
		with utilisateur_reel():
			with self.assertRaises(frappe.ValidationError):
				verifier_date_validation(add_days(today(), LIMITE_FUTUR_JOURS + 1), "bl")

	# ── Annulation ──────────────────────────────────────────────────────────

	def test_annulation_hier_refusee(self):
		with utilisateur_reel():
			with self.assertRaises(frappe.ValidationError):
				verifier_date_annulation(add_days(today(), -1), "bl")

	def test_annulation_aujourdhui_acceptee(self):
		with utilisateur_reel():
			verifier_date_annulation(today(), "bl")

	def test_annulation_sans_borne_haute(self):
		"""Volontairement PAS de borne haute à l'annulation : une date lointaine ne
		clôt rien, et un document daté au-delà de demain ne peut venir que de
		l'Administrateur — le refuser coincerait tout le monde."""
		with utilisateur_reel():
			verifier_date_annulation(add_days(today(), 30), "bl")

	# ── Les sorties anticipées ──────────────────────────────────────────────

	def test_administrator_passe(self):
		"""Il est averti AVANT le geste, côté client — pas refusé côté serveur."""
		verifier_date_validation(add_days(today(), -30), "bl")
		verifier_date_annulation(add_days(today(), -30), "bl")

	def test_traitement_systeme_passe(self):
		"""Sans cette sortie, un `bench migrate` échouerait : l'import Omag a créé
		des BL de 2022."""
		with utilisateur_reel():
			frappe.flags.in_migrate = True
			try:
				verifier_date_validation(add_days(today(), -365), "bl")
			finally:
				frappe.flags.in_migrate = False

	def test_date_vide_ne_controle_rien(self):
		with utilisateur_reel():
			verifier_date_validation(None, "bl")
			verifier_date_annulation("", "bl")

	# ── Les neuf documents ──────────────────────────────────────────────────

	def test_les_neuf_documents_sont_couverts(self):
		"""Le refus est bilingue : un libellé manquant produirait un message troué."""
		attendus = {
			"bl", "retour", "paiement", "br", "bon_es",
			"paiement_br", "ecriture", "reconciliation", "remise",
		}
		self.assertEqual(set(DOCUMENTS), attendus)
		for cle, libelles in DOCUMENTS.items():
			self.assertTrue(libelles.get("fr"), f"{cle} : libellé français manquant")
			self.assertTrue(libelles.get("ar"), f"{cle} : libellé arabe manquant")

	def test_chaque_document_est_verrouille(self):
		with utilisateur_reel():
			for cle in DOCUMENTS:
				with self.assertRaises(frappe.ValidationError, msg=f"{cle} n'est pas verrouillé"):
					verifier_date_validation(add_days(today(), -1), cle)
