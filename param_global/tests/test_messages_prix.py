"""Les deux refus de prix : montant nul et vente à perte.

Ils vivent ici depuis le 2026-09-11 : le message était auparavant recopié dans
`bon_livraison`, `bon_reception` et `devis` — trois exemplaires identiques au
caractère près, plus leurs jumeaux côté client. C'est le mécanisme qui a produit
les dix-sept copies divergentes des loupes de colonne.

Ce que ces tests protègent :

1. **Le bilingue.** Ces refus sont sans recours pour la personne au comptoir, et
   une partie d'entre elles lit mieux l'arabe.
2. **Le format de nombre FRANÇAIS.** `vente_perte` formatait avec `"{:,.2f}"`,
   c'est-à-dire le format anglais : une perte de 1 292,60 DH s'affichait
   « 1,292.60 », alors que le dialogue client, lui, écrivait « 1.292,60 ». Le
   même chiffre, deux écritures, selon qui validait.
3. **Les deux pictogrammes DISTINCTS.** Les deux refus tombent au même moment,
   sur le même bouton : s'ils se ressemblaient, on ne saurait plus lequel on
   vient de lire.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from param_global import montant_nul, vente_perte


def _message():
	"""Le dernier message poussé par `frappe.throw`."""
	return frappe.message_log[-1].get("message")


def _titre():
	return frappe.message_log[-1].get("title")


LIGNES_NULLES = [
	frappe._dict(idx=1, item_code="ART-A", item_name="ARTICLE A"),
	frappe._dict(idx=4, item_code="ART-B", item_name=None),
]

#: (ligne, prix d'achat, prix de vente) — une perte de 292,60
LIGNES_PERTE = [
	(frappe._dict(idx=1, item_code="ART-A", item_name="ARTICLE A"), 1292.60, 1000.00),
]


class TestMontantNul(FrappeTestCase):
	def setUp(self):
		frappe.clear_messages()

	def test_refuse(self):
		with self.assertRaises(frappe.ValidationError):
			montant_nul.refuser(LIGNES_NULLES)

	def test_bilingue(self):
		with self.assertRaises(frappe.ValidationError):
			montant_nul.refuser(LIGNES_NULLES)
		msg = _message()
		self.assertIn("Validation impossible — Montant nul", msg)
		self.assertIn("المصادقة غير ممكنة — مبلغ صفري", msg)
		self.assertIn("المنتجات التالية مبلغها صفر", msg)
		self.assertIn("Validation impossible", _titre())
		self.assertIn("المصادقة غير ممكنة", _titre())

	def test_zero_rouge_et_pas_de_triangle(self):
		"""Le pictogramme nomme le défaut ; le triangle générique ne disait rien."""
		with self.assertRaises(frappe.ValidationError):
			montant_nul.refuser(LIGNES_NULLES)
		msg = _message()
		self.assertIn("#cc0000", msg)
		self.assertNotIn("⚠️", msg)

	def test_toutes_les_lignes_dans_les_deux_langues(self):
		with self.assertRaises(frappe.ValidationError):
			montant_nul.refuser(LIGNES_NULLES)
		msg = _message()
		for mot_ligne in ("Ligne", "السطر"):
			self.assertIn(f"{mot_ligne} 1 ", msg)
			self.assertIn(f"{mot_ligne} 4 ", msg)

	def test_liste_isolee_en_ltr(self):
		"""Sans isolation, l'arabe réordonne les codes latins à l'affichage."""
		with self.assertRaises(frappe.ValidationError):
			montant_nul.refuser(LIGNES_NULLES)
		self.assertIn('<ul dir="ltr"', _message())

	def test_libelle_absent_tolere(self):
		"""`item_name` vide ne doit pas écrire « None » dans le message."""
		with self.assertRaises(frappe.ValidationError):
			montant_nul.refuser(LIGNES_NULLES)
		self.assertNotIn("None", _message())


class TestVentePerte(FrappeTestCase):
	def setUp(self):
		frappe.clear_messages()

	def test_refuse(self):
		with self.assertRaises(frappe.ValidationError):
			vente_perte.refuser(LIGNES_PERTE)

	def test_bilingue(self):
		with self.assertRaises(frappe.ValidationError):
			vente_perte.refuser(LIGNES_PERTE)
		msg = _message()
		self.assertIn("Validation impossible — Vente à perte", msg)
		self.assertIn("المصادقة غير ممكنة — البيع بخسارة", msg)
		self.assertIn("ثمن البيع أقل من آخر ثمن شراء", msg)

	def test_entetes_traduits(self):
		with self.assertRaises(frappe.ValidationError):
			vente_perte.refuser(LIGNES_PERTE)
		msg = _message()
		for entete in ("Ligne", "Article", "Vente", "Achat", "Perte"):
			self.assertIn(f">{entete}<", msg)
		for entete in ("السطر", "المنتج", "البيع", "الشراء", "الخسارة"):
			self.assertIn(f">{entete}<", msg)

	def test_format_de_nombre_francais(self):
		"""⚠️ LE test de non-régression le plus important de ce fichier.

		Le code d'origine écrivait `"{:,.2f}"` — format ANGLAIS. Un montant à
		quatre chiffres est le seul qui révèle la faute : en dessous de 1 000,
		les deux formats donnent le même texte.
		"""
		with self.assertRaises(frappe.ValidationError):
			vente_perte.refuser(LIGNES_PERTE)
		msg = _message()
		self.assertIn("1.292,60", msg)  # achat
		self.assertIn("1.000,00", msg)  # vente
		self.assertIn("292,60", msg)  # perte
		self.assertNotIn("1,292.60", msg)
		self.assertNotIn("1,000.00", msg)

	def test_pictogramme_distinct_du_montant_nul(self):
		"""Les deux refus tombent sur le même bouton : ils doivent se distinguer."""
		with self.assertRaises(frappe.ValidationError):
			vente_perte.refuser(LIGNES_PERTE)
		msg = _message()
		self.assertIn("📉", msg)
		self.assertNotIn(montant_nul.ZERO_ROUGE, msg)

	def test_tableau_isole_en_ltr(self):
		with self.assertRaises(frappe.ValidationError):
			vente_perte.refuser(LIGNES_PERTE)
		self.assertIn('<table dir="ltr"', _message())


class TestPictogrammeDoublon(FrappeTestCase):
	"""Le troisième refus de saisie — « article en double ».

	⚠️ Il n'a PAS de versant serveur : deux lignes du même article sont
	parfaitement légitimes (deux prix, deux remises), on ne refuse rien, on pose
	une question. Le dialogue vit donc uniquement dans
	`public/js/pg_doublon_article.bundle.js`.

	Ces tests lisent le FICHIER SOURCE. C'est un test faible — il ne prouve pas
	que le dialogue s'affiche —, mais c'est le seul levier disponible côté
	Python, et ce qu'il protège est précisément la règle que les deux classes
	ci-dessus protègent déjà : trois défauts qui tombent au même moment, sur le
	même geste, doivent se reconnaître AVANT qu'on lise le texte.
	"""

	@staticmethod
	def _source():
		return frappe.read_file(
			frappe.get_app_path("param_global", "public", "js", "pg_doublon_article.bundle.js")
		)

	@classmethod
	def _code(cls):
		"""Le source SANS ses commentaires.

		⚠️ Le fichier CITE ses deux frères en commentaire (« frère du « 0 » rouge
		et du « 📉 » »), et une recherche naïve y voyait un pictogramme partagé.
		"""
		return "\n".join(
			l for l in cls._source().splitlines() if not l.lstrip().startswith("//")
		)

	def test_compteur_plein_cadre(self):
		"""Le « ×2 » orange, frère du « 0 » rouge et du « 📉 »."""
		src = self._code()
		self.assertIn("#e07000", src)
		self.assertIn("font-size:3.5em", src)
		self.assertIn("×${nb_total}", src)

	def test_pas_de_triangle_generique(self):
		"""⚠️ est le pictogramme de TOUS les avertissements : il ne nomme rien."""
		self.assertNotIn("⚠️ ${article}", self._code())

	def test_pictogramme_distinct_des_deux_refus_de_prix(self):
		src = self._code()
		self.assertNotIn("📉", src)
		self.assertNotIn("#cc0000", src)
