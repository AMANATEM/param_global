"""Le verrou administrateur — l'état serveur qui ferme les écrans d'argent.

Ce module existe parce que `has_permission()` commence par
`if user == "Administrator": return True` : aucun rôle ne peut protéger une
session Administrator laissée ouverte au comptoir. Ce qui suit vérifie que la
barrière tient côté SERVEUR, seul endroit où elle compte.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from param_global import verrou

from .utils import utilisateur_reel


class TestVerrou(FrappeTestCase):
	ZONE = "caisse"

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# ⚠️ `FrappeTestCase.ADMIN_PASSWORD` est lu dans le `site_config.json` du
		# site de test. Sans la clé, `check_password` échoue et la moitié de ces
		# tests tombe sur un « Mot de passe incorrect » qui ne dit pas la cause.
		# On échoue FRANCHEMENT plutôt que de sauter en silence : un test de
		# sécurité qui se passe tout seul est pire que pas de test.
		if not cls.ADMIN_PASSWORD:
			raise AssertionError(
				"admin_password absent du site_config du site de test. "
				"Corriger avec : bench --site <site> set-config admin_password <mdp>"
			)

	def setUp(self):
		verrou.verrouiller(self.ZONE)
		frappe.cache().delete_value(verrou._cle_essais())

	def tearDown(self):
		verrou.verrouiller(self.ZONE)
		frappe.cache().delete_value(verrou._cle_essais())

	# ── Les trois zones ─────────────────────────────────────────────────────

	def test_les_trois_zones_et_leurs_durees(self):
		"""La vérification journalière se fait en une passe, mais elle est longue —
		d'où l'heure, contre 5 min pour les écrans de consultation."""
		self.assertEqual(
			verrou.ZONES,
			{"caisse": 5 * 60, "encaissements": 5 * 60, "verification": 60 * 60},
		)

	def test_zone_inconnue_refusee(self):
		with self.assertRaises(frappe.ValidationError):
			verrou.etat("zone_qui_n_existe_pas")

	# ── Ouverture / fermeture ───────────────────────────────────────────────

	def test_ferme_par_defaut(self):
		self.assertFalse(verrou.est_deverrouille(self.ZONE))
		self.assertEqual(verrou.etat(self.ZONE)["deverrouille"], 0)

	def test_exiger_refuse_quand_ferme(self):
		with self.assertRaises(frappe.PermissionError):
			verrou.exiger(self.ZONE)

	def test_deverrouiller_puis_exiger(self):
		etat = verrou.deverrouiller(self.ZONE, self.ADMIN_PASSWORD)
		self.assertEqual(etat["deverrouille"], 1)
		self.assertGreater(etat["restant"], 0)
		self.assertLessEqual(etat["restant"], verrou.ZONES[self.ZONE])
		verrou.exiger(self.ZONE)  # ne doit plus lever

	def test_verrouiller_referme_avant_expiration(self):
		verrou.deverrouiller(self.ZONE, self.ADMIN_PASSWORD)
		verrou.verrouiller(self.ZONE)
		self.assertFalse(verrou.est_deverrouille(self.ZONE))

	def test_zones_independantes(self):
		"""Ouvrir la caisse n'ouvre pas les encaissements."""
		verrou.deverrouiller(self.ZONE, self.ADMIN_PASSWORD)
		self.assertFalse(verrou.est_deverrouille("encaissements"))
		verrou.verrouiller("encaissements")

	# ── Mot de passe et force brute ─────────────────────────────────────────

	def test_mauvais_mot_de_passe(self):
		with self.assertRaises(frappe.AuthenticationError):
			verrou.deverrouiller(self.ZONE, "pas-le-bon")
		self.assertFalse(verrou.est_deverrouille(self.ZONE))

	def test_blocage_apres_cinq_essais(self):
		"""Sans ce compteur, un mot de passe se teste en boucle depuis la console :
		le dialogue n'est qu'un appel whitelisté de plus."""
		for _ in range(verrou.MAX_ESSAIS):
			with self.assertRaises(frappe.AuthenticationError):
				verrou.deverrouiller(self.ZONE, "pas-le-bon")

		# Le 6ᵉ essai est refusé même avec le BON mot de passe.
		with self.assertRaises(frappe.AuthenticationError):
			verrou.deverrouiller(self.ZONE, self.ADMIN_PASSWORD)
		self.assertFalse(verrou.est_deverrouille(self.ZONE))

	def test_essais_remis_a_zero_apres_succes(self):
		with self.assertRaises(frappe.AuthenticationError):
			verrou.deverrouiller(self.ZONE, "pas-le-bon")
		verrou.deverrouiller(self.ZONE, self.ADMIN_PASSWORD)
		self.assertEqual(frappe.cache().get_value(verrou._cle_essais(), expires=True), None)

	# ── Les autres comptes ──────────────────────────────────────────────────

	def test_autre_compte_na_rien_a_ouvrir(self):
		"""Le verrou ne vise QUE la session Administrator : pour les autres, ce sont
		les rôles qui ferment ces écrans."""
		with utilisateur_reel():
			self.assertFalse(verrou.est_deverrouille(self.ZONE))
			with self.assertRaises(frappe.PermissionError):
				verrou.deverrouiller(self.ZONE, self.ADMIN_PASSWORD)

	# ── Appels internes vs appels HTTP ──────────────────────────────────────

	def test_appel_direct_faux_hors_requete_http(self):
		"""`verification` appelle les fonctions de `caisse` en Python : un garde-fou
		aveugle casserait la vérification journalière dès que la caisse est fermée."""
		self.assertFalse(verrou.appel_direct("caisse.api.solde_caisse"))
