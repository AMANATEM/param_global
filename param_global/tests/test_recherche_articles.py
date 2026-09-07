"""La recherche d'articles : le tri part au SERVEUR, avant le `LIMIT`.

⚠️ La raison d'être du module. Sans lui, le serveur renvoyait les 50 premiers
articles PAR CODE et le navigateur ne pouvait réordonner que ceux-là : demander
« les articles en stock au garage » sur une recherche qui en compte 255 donnait
une réponse FAUSSE — les rares en stock parmi les 50 premiers codes, et rien
d'autre.
"""

import frappe
from frappe.utils import flt

from param_global.recherche_articles import (
	COLONNES,
	DERN_ACHAT,
	PAGE_LEN_MINI,
	articles,
	tri_depuis_filtres,
)
from param_global.tests.base import CycleDeVieTestCase


class TestTriDepuisFiltres(CycleDeVieTestCase):
	"""L'analyse de `pg_tri`, posé par `pg_tri_dropdown.bundle.js`."""

	def test_libelle_normalise(self):
		"""« Dépôt », « DEPOT », « Dern. achat » : accents et points ignorés."""
		for libelle in ("Dépôt", "DEPOT", "depot"):
			tri = tri_depuis_filtres({"pg_tri": {"colonne": libelle, "sens": "desc"}})
			self.assertIsNotNone(tri, f"« {libelle} » non reconnu")
			self.assertEqual(tri[0], COLONNES["depot"][0])

	def test_dern_achat_depend_de_l_app_appelante(self):
		"""⚠️ « Dern. achat » ne se calcule PAS pareil d'une app à l'autre, et le
		tri doit porter sur la valeur RÉELLEMENT AFFICHÉE. `bon_livraison` montre
		`dernier_prix_achat_ttc` ; les cinq autres recalculent
		`last_purchase_rate × (1 + TVA)`. La multiplication n'étant pas monotone —
		100 HT à 20 % passe devant 110 HT à 0 % — trier sur le HT donnerait un
		ordre faux."""
		filtres = {"pg_tri": {"colonne": "Dern. achat", "sens": "asc"}}
		self.assertEqual(tri_depuis_filtres(filtres, "dpa_ttc")[0], DERN_ACHAT["dpa_ttc"][0])
		self.assertEqual(tri_depuis_filtres(filtres, "achat_ttc")[0], DERN_ACHAT["achat_ttc"][0])
		self.assertNotEqual(DERN_ACHAT["dpa_ttc"][0], DERN_ACHAT["achat_ttc"][0])

	def test_le_sens_est_reduit_a_asc_ou_desc(self):
		"""⚠️ Le sens part dans le SQL par CONCATÉNATION — un `ORDER BY` ne se
		paramètre pas. Rien d'autre que ces deux mots ne doit pouvoir s'y glisser."""
		for saisie, attendu in (
			("desc", "DESC"), ("DESC", "DESC"), ("asc", "ASC"), ("", "ASC"),
			("; DROP TABLE tabItem --", "ASC"), (None, "ASC"),
		):
			tri = tri_depuis_filtres({"pg_tri": {"colonne": "code", "sens": saisie}})
			self.assertEqual(tri[1], attendu, f"sens « {saisie} » mal réduit")

	def test_colonne_inconnue_retombe_sur_le_tri_par_code(self):
		"""Une app qui nommerait autrement sa colonne : on renvoie None plutôt que
		d'injecter, et le classement local du navigateur reste le filet."""
		self.assertIsNone(tri_depuis_filtres({"pg_tri": {"colonne": "colonne inventée"}}))
		self.assertIsNone(tri_depuis_filtres({"pg_tri": {"colonne": "i.name; DELETE FROM tabItem"}}))

	def test_entrees_malformees_ne_plantent_pas(self):
		for filtres in (None, "", "pas du json", [], {"pg_tri": "cassé"}, {"pg_tri": 42}, {}):
			self.assertIsNone(tri_depuis_filtres(filtres))

	def test_filtres_en_chaine_json(self):
		"""Le client envoie ses filtres en JSON : le module doit les décoder."""
		import json

		tri = tri_depuis_filtres(json.dumps({"pg_tri": {"colonne": "code", "sens": "desc"}}))
		self.assertEqual(tri[1], "DESC")


class TestArticles(CycleDeVieTestCase):
	"""La requête elle-même — et surtout l'ordre du `ORDER BY` et du `LIMIT`."""

	def setUp(self):
		self.entrepot = self.creer_entrepot_test("GARAGE")
		# ⚠️ Le `item_code` demandé n'est PAS celui qui est posé : cette instance
		# nomme les articles par série (`Stock Settings.item_naming_by`). On cherche
		# donc sur le LIBELLÉ, qui lui est conservé tel quel.
		self.a = self.creer_article_test(code="_TEST_RA_A", nom="TESTRA ZEBRE ALPHA")
		self.b = self.creer_article_test(code="_TEST_RA_B", nom="TESTRA ANANAS BETA")

	def _noms(self, txt="TESTRA", **kwargs):
		return [r["name"] for r in articles(txt, 20, 0, **kwargs)]

	def test_recherche_multi_mots_dans_n_importe_quel_ordre(self):
		"""Chaque mot doit apparaître dans le code OU le nom, l'ordre est libre."""
		self.assertIn(self.a.name, self._noms("zebre alpha"))
		self.assertIn(self.a.name, self._noms("alpha zebre"))
		self.assertNotIn(self.b.name, self._noms("zebre"))

	def test_la_fenetre_ne_descend_jamais_sous_70(self):
		"""⚠️ `PAGE_LEN_MINI` : la fenêtre est passée de 20 à 70 le 2026-08-22.
		Une demande plus courte est relevée, jamais honorée telle quelle."""
		self.assertEqual(PAGE_LEN_MINI, 70)
		for demande in (1, 20, 50, None, 0):
			self.assertLessEqual(len(articles("", demande, 0)), max(70, demande or 0) + 1)

	def test_tri_par_designation(self):
		"""Le classement doit venir du SQL, donc porter sur TOUS les articles —
		pas seulement sur ceux que le `LIMIT` aurait laissés passer."""
		croissant = self._noms(filters={"pg_tri": {"colonne": "designation", "sens": "asc"}})
		decroissant = self._noms(filters={"pg_tri": {"colonne": "designation", "sens": "desc"}})
		self.assertLess(croissant.index(self.b.name), croissant.index(self.a.name))
		self.assertLess(decroissant.index(self.a.name), decroissant.index(self.b.name))

	def test_tri_sur_une_colonne_jointe(self):
		"""⚠️ Les jointures ne sont posées QUE si l'on trie dessus : prix, stocks et
		TVA vivent hors de `tabItem`. Sans tri — le cas courant — la requête reste
		un simple `ORDER BY name`. Ce test vérifie que la jointure fonctionne."""
		noms = self._noms(filters={"pg_tri": {"colonne": "garage", "sens": "desc"}})
		self.assertIn(self.a.name, noms)
		self.assertIn(self.b.name, noms)

	def test_exclure_ecarte_l_article_manuel(self):
		"""Les documents de vente et d'achat écartent `I00001` ; les écritures et
		régularisations, elles, ne l'excluent pas — elles n'ont pas de ligne libre."""
		self.assertNotIn(self.a.name, self._noms(exclure=self.a.name))
		self.assertIn(self.a.name, self._noms())

	def test_un_article_desactive_disparait(self):
		frappe.db.set_value("Item", self.b.name, "disabled", 1)
		self.assertNotIn(self.b.name, self._noms())
		frappe.db.set_value("Item", self.b.name, "disabled", 0)
