"""Le verrou chronologique — la fenêtre [J+0, J+1] pour valider, [J+0, ∞[ pour annuler.

⚠️ Aucun des 26 tests de cycle de vie n'exerce ce verrou : `in_test` le désactive,
comme pour un `bench migrate`. C'est ici, et seulement ici, qu'il est réellement
éprouvé — d'où le passage par `utilisateur_reel()`.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today

from param_global import controle_date
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


class TestVerrousLeves(FrappeTestCase):
	"""La clé `tests_sans_verrous` de `site_config.json` lève le verrou.

	⚠️ Elle sert une CAMPAGNE DE TESTS sur une machine de développement : elle
	permet de rejouer un scénario en datant librement les documents. Elle vit
	hors git, donc la production ne l'a pas et le verrou y reste actif même
	après promotion de ce code — c'est toute la raison de ne pas avoir mis un
	drapeau dans le source.
	"""

	def setUp(self):
		super().setUp()
		self.addCleanup(frappe.conf.pop, controle_date.CLE_TESTS, None)

	def _lever(self):
		frappe.conf[controle_date.CLE_TESTS] = 1

	def test_sans_la_cle_le_verrou_tient(self):
		frappe.conf.pop(controle_date.CLE_TESTS, None)
		self.assertFalse(controle_date.verrous_leves())

	def test_avec_la_cle_le_verrou_est_leve(self):
		self._lever()
		self.assertTrue(controle_date.verrous_leves())

	def test_une_validation_antidatee_passe(self):
		"""Le cas qui motive la levée : rejouer un document daté d'il y a un an."""
		self._lever()
		with utilisateur_reel():
			# Ne doit rien lever.
			controle_date.verifier_date_validation("2025-01-01", "bl")

	def test_une_annulation_antidatee_passe(self):
		self._lever()
		with utilisateur_reel():
			controle_date.verifier_date_annulation("2025-01-01", "bl")

	def test_le_verrou_refuse_TOUJOURS_sans_la_cle(self):
		"""Le garde-fou du garde-fou : sans la clé, le refus doit revenir.

		Sans ce test, une levée laissée en place passerait inaperçue — toute la
		suite resterait verte alors que le verrou ne protégerait plus rien.
		"""
		frappe.conf.pop(controle_date.CLE_TESTS, None)
		with utilisateur_reel():
			with self.assertRaises(frappe.ValidationError):
				controle_date.verifier_date_validation("2025-01-01", "bl")
