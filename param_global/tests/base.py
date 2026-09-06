"""Le cycle de vie d'un document soumissionnable, écrit UNE fois pour tout le bench.

Créer → enregistrer → valider → annuler → « Nouv. version » → enregistrer.
C'est le parcours que fait réellement un utilisateur, et c'est celui qui traverse
le plus de code : chaque étape déclenche la cascade de `doc_events` des apps
concernées, et surtout leurs chemins INVERSES — `on_cancel` défait ce que
`on_submit` a posé. Le code d'annulation est écrit une fois, essayé une fois à la
main, puis jamais relu : c'est là que dorment les régressions.

⚠️ Ce moteur vit dans `param_global` et NON recopié dans chaque app. Le mécanisme
de la copie a déjà coûté cher ici : `pg_loupes` a existé en dix-sept exemplaires
divergents, et c'est ainsi qu'une faute de frappe a survécu des mois dans une
seule d'entre elles. Une vérification ajoutée ici profite aux treize doctypes ;
ajoutée dans une copie, elle ne profite à personne d'autre.

Contrepartie assumée, la même que pour `controle_date.py` : une modification de
ce fichier peut casser les tests des vingt autres apps, et leur CI ne le verra
qu'à leur prochain push.

Usage, dans l'app propriétaire du doctype :

	from param_global.tests.base import CycleDeVieTestCase

	class TestMouvementCaisse(CycleDeVieTestCase):
		def test_cycle(self):
			self.cycle_complet("Mouvement Caisse", {...})
"""

import frappe
from frappe.tests.utils import FrappeTestCase

CHAMP_VALIDATION = "date_validation"


class CycleDeVieTestCase(FrappeTestCase):
	"""Base des tests de cycle de vie. Hérite du rollback de `FrappeTestCase`."""

	def cycle_complet(self, doctype, champs, apres_validation=None, apres_annulation=None):
		"""Déroule le cycle complet sur `doctype`, monté avec `champs`.

		`apres_validation` / `apres_annulation` reçoivent le document rechargé :
		c'est là qu'une app pose ses vérifications propres (le `montant_paye` d'un
		BL, les `Mouvement Caisse` d'une Vérification…). Le cycle lui-même ne
		connaît que ce qui vaut pour les treize doctypes.

		Renvoie la nouvelle version, pour qui veut continuer dessus.
		"""
		self.verifier_amendable(doctype)

		# ── Créer + enregistrer ─────────────────────────────────────────────
		doc = frappe.get_doc({"doctype": doctype, **champs})
		doc.insert()
		self.assertEqual(doc.docstatus, 0, f"{doctype} : l'enregistrement n'a pas donné un brouillon")

		# ── Valider ─────────────────────────────────────────────────────────
		doc.submit()
		self.assertEqual(doc.docstatus, 1, f"{doctype} : la validation n'a pas pris")

		# ⚠️ `validation.on_submit` écrit par `frappe.db.set_value(update_modified=False)`,
		# donc l'objet en mémoire ignore le champ : sans ce `reload()`, l'assertion
		# ci-dessous échouerait sur un document pourtant correct en base.
		doc.reload()
		self.assertTrue(
			doc.get(CHAMP_VALIDATION),
			f"{doctype} : param_global n'a pas posé « Validé le » à la validation",
		)
		if apres_validation:
			apres_validation(doc)

		# ── Annuler ─────────────────────────────────────────────────────────
		doc.cancel()
		self.assertEqual(doc.docstatus, 2, f"{doctype} : l'annulation n'a pas pris")

		doc.reload()
		self.assertFalse(
			doc.get(CHAMP_VALIDATION),
			f"{doctype} : « Validé le » n'a pas été vidé à l'annulation",
		)
		if apres_annulation:
			apres_annulation(doc)

		# ── « Nouv. version » + enregistrer ──────────────────────────────────
		# ⚠️ `ignore_no_copy=False` est OBLIGATOIRE pour être fidèle au desk.
		# Le défaut de `frappe.copy_doc` est `True` — il CONSERVE les champs
		# `no_copy`, ce que le bouton « Nouv. version » ne fait jamais. Sur un
		# `Retour`, le champ `delivery_note` (« Bon de Retour ERPNext », no_copy)
		# était donc recopié et pointait sur un document ANNULÉ : l'insertion
		# échouait sur « Cannot link cancelled document ». Le desk, lui, l'efface.
		nouveau = frappe.copy_doc(doc, ignore_no_copy=False)
		nouveau.amended_from = doc.name

		# ⚠️ `docstatus` doit être remis à 0 à LA MAIN, et c'est propre aux tests.
		# `frappe.copy_doc` efface `docstatus` — SAUF quand `flags.in_test` est vrai
		# (frappe/__init__.py : `if not local.flags.in_test: fields_to_clear.append(...)`).
		# La copie d'un document annulé arrive donc ici avec `docstatus = 2`, et
		# `insert()` la refuse : « Cannot change docstatus from 0 (Draft) to 2 ».
		# Le desk, lui, le pose explicitement (`Form.amend_doc` → `newdoc.docstatus = 0`),
		# on reproduit donc le vrai geste plutôt que de compter sur la copie.
		nouveau.docstatus = 0
		nouveau.insert()
		self.assertEqual(nouveau.docstatus, 0, f"{doctype} : la nouvelle version n'est pas un brouillon")
		self.assertEqual(
			nouveau.amended_from,
			doc.name,
			f"{doctype} : la nouvelle version ne pointe pas vers le document annulé",
		)
		self.assertNotEqual(nouveau.name, doc.name, f"{doctype} : la nouvelle version a repris le même nom")

		return nouveau

	def verifier_amendable(self, doctype):
		"""Les deux conditions du standard « DocTypes soumissionnables ».

		⚠️ Contrôlé sur les MÉTADONNÉES et non en cliquant, parce que les tests
		tournent sous `Administrator` — qui court-circuite `has_permission()`.
		Un `amend: 1` manquant laisserait donc passer le cycle ci-dessus tout en
		privant les vrais utilisateurs du bouton « Nouv. version ». C'est
		précisément le défaut qu'avait `Paiement BL` jusqu'en 0.51.1.
		"""
		meta = frappe.get_meta(doctype)
		self.assertTrue(meta.is_submittable, f"{doctype} n'est pas soumissionnable")

		self.assertTrue(
			meta.get_field("amended_from"),
			f"{doctype} : champ `amended_from` absent — le bouton « Nouv. version » affichera "
			f"« Le champ proviens de doit être présent »",
		)

		roles = [p.role for p in meta.permissions if p.amend]
		self.assertTrue(
			roles,
			f"{doctype} : aucun rôle n'a la permission `amend` — le bouton « Nouv. version » "
			f"n'apparaîtra pour personne",
		)

	def verifier_title_field(self, doctype):
		"""Standard « title_field obligatoire » — à appeler depuis les doctypes qui ont une liste.

		Sans `title_field`, Frappe met l'ID en 1ʳᵉ colonne ET n'ajoute jamais la
		colonne ID finale : la liste ne ressemble à aucune autre du bench. Défaut
		corrigé après coup sur `Retour`, `Paiement BL` et `Paiement BR`.
		"""
		meta = frappe.get_meta(doctype)
		self.assertTrue(meta.title_field, f"{doctype} : `title_field` non déclaré")

	# ── Décors partagés ─────────────────────────────────────────────────────
	#
	# Client et Fournisseur sont des doctypes ERPNext, mais leur `code_tiers` est
	# posé par `param_global.tiers` : c'est donc bien cette app qui sait les
	# fabriquer correctement. Tout ce qui est propre à un domaine (un Paiement BL,
	# un Bon de Réception) reste chez l'app propriétaire.

	def creer_client_test(self, nom="_Test Client Cycle", **champs):
		"""Un Customer minimal, réutilisé s'il existe déjà dans la transaction.

		⚠️ `mobile_no` est fourni d'office : l'app `client` l'exige à la CRÉATION
		(`client/customer.py::validate`), et un décor qui ne le pose pas fait
		échouer tous les tests des apps qui créent un client — sur un message qui
		n'a rien à voir avec ce qu'elles testent. Le format suit la règle maison :
		10 chiffres commençant par 0, sans séparateur.
		"""
		if frappe.db.exists("Customer", {"customer_name": nom}):
			return frappe.get_last_doc("Customer", filters={"customer_name": nom})
		champs.setdefault("mobile_no", "0600000000")
		return frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": nom,
				"customer_group": frappe.db.get_value("Customer Group", {"is_group": 0}, "name"),
				"territory": frappe.db.get_value("Territory", {"is_group": 0}, "name"),
				**champs,
			}
		).insert()

	def creer_fournisseur_test(self, nom="_Test Fournisseur Cycle", **champs):
		"""Un Supplier minimal."""
		if frappe.db.exists("Supplier", {"supplier_name": nom}):
			return frappe.get_last_doc("Supplier", filters={"supplier_name": nom})
		champs.setdefault("mobile_no", "0600000001")
		return frappe.get_doc(
			{
				"doctype": "Supplier",
				"supplier_name": nom,
				"supplier_group": frappe.db.get_value("Supplier Group", {"is_group": 0}, "name"),
				**champs,
			}
		).insert()

	# ── Décor du stock ──────────────────────────────────────────────────────
	#
	# Article, entrepôts et stock initial : le décor le plus coûteux du bench,
	# partagé par les sept documents qui touchent au stock (BL, Retour, BR,
	# Bon E/S, Écriture, Réconciliation) et par la détection GARAGE.
	#
	# ⚠️ Les entrepôts portent les noms RÉELS de la production —
	# `GARAGE - AMA`, `PRINCIPAL - AMA`, `DEPOT - AMA` — parce que `garage/sync.py`
	# les compare littéralement. Un entrepôt de test nommé autrement rendrait la
	# détection GARAGE intestable.

	ENTREPOTS = ("PRINCIPAL", "GARAGE", "DEPOT")

	def societe_test(self):
		return frappe.defaults.get_defaults().get("company") or frappe.db.get_value("Company", {}, "name")

	def creer_entrepot_test(self, nom="PRINCIPAL"):
		"""Un entrepôt nommé comme en production : « <nom> - <abbr société> »."""
		societe = self.societe_test()
		abbr = frappe.db.get_value("Company", societe, "abbr")
		complet = f"{nom} - {abbr}"
		if frappe.db.exists("Warehouse", complet):
			return complet
		frappe.get_doc(
			{
				"doctype": "Warehouse",
				"warehouse_name": nom,
				"company": societe,
				"parent_warehouse": frappe.db.get_value("Warehouse", {"is_group": 1}, "name"),
			}
		).insert(ignore_permissions=True)
		return complet

	def creer_article_test(self, code="_TEST_ART_1", nom=None, **champs):
		"""Un article stockable, en « Unité » — l'UOM par défaut du bench."""
		if frappe.db.exists("Item", code):
			return frappe.get_doc("Item", code)
		return frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": code,
				"item_name": nom or code,
				"item_group": frappe.db.get_value("Item Group", {"is_group": 0}, "name"),
				"stock_uom": "Unité",
				"is_stock_item": 1,
				**champs,
			}
		).insert(ignore_permissions=True)

	def poser_stock(self, item_code, entrepot, qty=100, rate=10):
		"""Entre du stock par une Écriture de Stock « Material Receipt » validée.

		⚠️ `param_global` autorise le stock négatif, donc ce n'est pas toujours
		nécessaire — mais un test qui part d'un stock connu dit quelque chose de
		plus fort qu'un test qui part d'un solde négatif quelconque.
		"""
		ecriture = frappe.get_doc(
			{
				"doctype": "Stock Entry",
				"stock_entry_type": "Material Receipt",
				"company": self.societe_test(),
				"items": [
					{"item_code": item_code, "qty": qty, "t_warehouse": entrepot, "basic_rate": rate}
				],
			}
		)
		ecriture.insert(ignore_permissions=True)
		ecriture.submit()
		return ecriture

	def vider_table(self, doctype):
		"""Vide une table avant un test qui compte ce qu'elle contient.

		⚠️ Nécessaire parce que le rollback de `FrappeTestCase` NE TIENT PAS
		partout : plusieurs hooks du bench appellent `frappe.db.commit()` —
		`bon_livraison/delivery_note.py` à la validation, `remise_bancaire/
		paiement_bl.py` à l'annulation — ce qui valide la transaction entière et
		laisse des documents derrière. Sans conséquence en CI (site neuf à chaque
		run) mais fatal à un test qui, comme `statut_garage()`, répond en fonction
		de ce qui reste en base : 21 pointages oubliés le faisaient répondre
		« NON OK » quoi qu'on fasse.
		"""
		frappe.db.sql(f"DELETE FROM `tab{doctype}`")
