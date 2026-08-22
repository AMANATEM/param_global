"""Sélection des articles des listes de recherche du desk — le tri se fait en SQL.

POURQUOI ICI, ET PAS DANS CHAQUE APP — la même liste déroulante d'articles est
dupliquée SEPT fois (Bon de Livraison, Retour, Devis, Bon de Commande, Bon de
Réception, Écriture de Stock, Réconciliation de Stock), chacune avec sa fonction
`recherche_article`. Le tri par clic sur un titre de colonne doit porter sur TOUT
le catalogue filtré, pas sur la page renvoyée : c'est une règle de sélection
transverse, elle n'appartient à aucun domaine — comme `grilles.py` ou
`api.recherche_article_liste`, elle vit donc dans `param_global`.

⚠️ CE QUE LE TRI CORRIGE — sans lui, le serveur renvoyait les 50 premiers
articles PAR CODE, et le navigateur ne pouvait réordonner que ces 50-là.
Demander « les articles en stock au garage » sur une recherche qui en compte 255
donnait donc une réponse FAUSSE : les rares en stock parmi les 50 premiers codes,
et rien d'autre. Le `ORDER BY` doit être en base, avant le `LIMIT`.

⚠️ LES JOINTURES NE SONT POSÉES QUE SI ON TRIE DESSUS. Prix, stocks et dernier
achat vivent hors de `tabItem` (`tabItem Price`, `tabBin`) : les agréger à chaque
frappe coûterait cher pour rien. Sans tri — le cas courant —, la requête reste
exactement celle d'avant : un simple `ORDER BY name` sur `tabItem`.
"""

import json
import unicodedata

import frappe
from frappe.utils import cstr, nowdate

# Nombre de résultats renvoyés au dropdown. 20 à l'origine, 50 puis 70 le
# 2026-08-22 : le tri portant désormais sur tout le catalogue, une fenêtre plus
# large donne une vraie vue d'ensemble sans rien changer à la justesse du
# classement — les 70 lignes restent le VRAI dessus du panier, pas les 70
# premiers codes.
PAGE_LEN_MINI = 70

# Libellés des entrepôts dont le stock est affiché puis trié.
GARAGE = "GARAGE"
DEPOT = "DEPOT"

# Libellé de colonne normalisé → (expression SQL, jointures nécessaires).
# Le libellé vient du titre cliqué dans le dropdown, d'où les variantes d'une app
# à l'autre : « Prix vente » côté vente, « Prix achat » côté achat, même colonne.
COLONNES = {
	"code": ("i.name", ()),
	"designation": ("i.item_name", ()),
	"prix vente": ("COALESCE(prix.rate, 0)", ("prix",)),
	"prix achat": ("COALESCE(prix.rate, 0)", ("prix",)),
	"garage": ("COALESCE(garage.qte, 0)", ("garage",)),
	"depot": ("COALESCE(depot.qte, 0)", ("depot",)),
}

# ⚠️ « Dern. achat » NE SE CALCULE PAS PAREIL D'UNE APP À L'AUTRE, et le tri doit
# porter sur la valeur RÉELLEMENT AFFICHÉE — sinon la colonne se réordonne sur un
# chiffre que personne ne voit, ce qui est pire que pas de tri du tout.
#
#   • `dpa_ttc`   — Bon de Livraison seul : champ custom `dernier_prix_achat_ttc`,
#                   déjà TTC, tenu à jour à chaque Bon de Réception validé.
#   • `achat_ttc` — les cinq autres : `last_purchase_rate` (HT) reconverti en TTC
#                   avec le taux de TVA de l'article. La multiplication n'est PAS
#                   monotone d'un article à l'autre — 100 HT à 20 % passe devant
#                   110 HT à 0 % —, donc trier sur le HT donnerait un ordre faux.
#                   Le taux est joint depuis les modèles de taxe, comme le fait
#                   déjà `_get_item_tax_rates` côté enrichissement.
DERN_ACHAT = {
	"dpa_ttc": ("COALESCE(i.dernier_prix_achat_ttc, 0)", ()),
	"achat_ttc": (
		"COALESCE(i.last_purchase_rate, 0) * (1 + COALESCE(tva.taux, 0) / 100)",
		("tva",),
	),
}

JOINTURES = {
	"prix": """
		LEFT JOIN (
			SELECT item_code, MAX(price_list_rate) AS rate
			FROM `tabItem Price`
			WHERE price_list = %(pl)s
			  AND (valid_from IS NULL OR valid_from <= %(today)s)
			  AND (valid_upto IS NULL OR valid_upto >= %(today)s)
			GROUP BY item_code
		) prix ON prix.item_code = i.name""",
	"garage": """
		LEFT JOIN (
			SELECT item_code, SUM(actual_qty) AS qte
			FROM `tabBin` WHERE warehouse = %(garage)s GROUP BY item_code
		) garage ON garage.item_code = i.name""",
	"depot": """
		LEFT JOIN (
			SELECT item_code, SUM(actual_qty) AS qte
			FROM `tabBin` WHERE warehouse = %(depot)s GROUP BY item_code
		) depot ON depot.item_code = i.name""",
	"tva": """
		LEFT JOIN (
			SELECT it.parent AS item_code, MAX(d.tax_rate) AS taux
			FROM `tabItem Tax` it
			JOIN `tabItem Tax Template Detail` d ON d.parent = it.item_tax_template
			GROUP BY it.parent
		) tva ON tva.item_code = i.name""",
}


def _normaliser(libelle):
	"""« Dern. achat » → « dern achat », « Dépôt » → « depot »."""
	texte = unicodedata.normalize("NFD", cstr(libelle).lower())
	texte = "".join(c for c in texte if unicodedata.category(c) != "Mn")
	return " ".join(texte.replace(".", " ").split())


def tri_depuis_filtres(filters, dern_achat="achat_ttc"):
	"""Extrait le tri demandé (`pg_tri`, posé par pg_tri_dropdown.bundle.js).

	Renvoie (expression SQL, "ASC"|"DESC", jointures nécessaires) ou None. Un
	libellé inconnu — une app qui nommerait autrement sa colonne — renvoie None :
	on retombe alors sur le tri par code, et le classement local du navigateur
	reste le filet de sécurité.
	"""
	if isinstance(filters, str):
		try:
			filters = json.loads(filters)
		except (ValueError, TypeError):
			return None
	if not isinstance(filters, dict):
		return None

	tri = filters.get("pg_tri")
	if isinstance(tri, str):
		try:
			tri = json.loads(tri)
		except (ValueError, TypeError):
			return None
	if not isinstance(tri, dict):
		return None

	libelle = _normaliser(tri.get("colonne"))
	colonne = COLONNES.get(libelle)
	if libelle == "dern achat":
		colonne = DERN_ACHAT.get(dern_achat)
	if not colonne:
		return None

	# Le sens ne peut valoir que ces deux mots : il part dans le SQL par
	# concaténation (un ORDER BY ne se paramètre pas), donc rien d'autre ne doit
	# pouvoir s'y glisser.
	sens = "DESC" if cstr(tri.get("sens")).lower() == "desc" else "ASC"
	return colonne[0], sens, colonne[1]


def _entrepot(libelle):
	return frappe.db.get_value("Warehouse", {"warehouse_name": libelle}, "name") or ""


def articles(
	txt, page_len, start, filters=None, price_list=None, exclure=None, dern_achat="achat_ttc"
):
	"""Lignes {name, item_name} du dropdown, triées côté base.

	`exclure` : code d'article à écarter (l'article manuel des documents de vente
	et d'achat ; les écritures et régularisations de stock, elles, ne l'excluent
	pas — elles n'ont pas de ligne libre).

	`dern_achat` : variante de calcul de la colonne « Dern. achat » de l'app
	appelante — voir DERN_ACHAT. Le tri doit porter sur la valeur affichée.
	"""
	tokens = [w for w in cstr(txt).strip().lower().split() if w]
	page_len = max(int(page_len or PAGE_LEN_MINI), PAGE_LEN_MINI)
	start = int(start or 0)

	conditions = ["i.disabled = 0"]
	params = {"len": page_len, "start": start}
	for idx, token in enumerate(tokens):
		conditions.append(f"(LOWER(i.name) LIKE %(t{idx})s OR LOWER(i.item_name) LIKE %(t{idx})s)")
		params[f"t{idx}"] = f"%{token}%"
	if exclure:
		conditions.append("i.name != %(exclure)s")
		params["exclure"] = exclure

	tri = tri_depuis_filtres(filters, dern_achat)
	jointures = ""
	if tri:
		expression, sens, besoin = tri
		# `i.name` en second critère : à valeur égale — et des stocks à 0, il y en
		# a des milliers — l'ordre reste celui du catalogue, donc stable d'une
		# frappe à l'autre.
		order_by = f"{expression} {sens}, i.name"
		jointures = "".join(JOINTURES[nom] for nom in besoin)
		if "prix" in besoin:
			params["pl"] = price_list or ""
			params["today"] = nowdate()
		if "garage" in besoin:
			params["garage"] = _entrepot(GARAGE)
		if "depot" in besoin:
			params["depot"] = _entrepot(DEPOT)
	else:
		order_by = "i.name"

	return frappe.db.sql(
		f"""SELECT i.name, i.item_name
		FROM `tabItem` i{jointures}
		WHERE {" AND ".join(conditions)}
		ORDER BY {order_by}
		LIMIT %(len)s OFFSET %(start)s""",
		params,
		as_dict=True,
	)
