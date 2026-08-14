"""Uniformise les grilles (tables enfants) des formulaires pour TOUS les utilisateurs.

Frappe stocke la présentation d'une grille dans `__UserSettings`, sous la clé
`GridView`, **par utilisateur** : `grid.js::setup_user_defined_columns()` en tire à
la fois l'ensemble des colonnes, leur **ordre** et leur largeur. Un compte qui n'a
jamais touché à sa grille retombe sur le défaut de Frappe (champs `in_list_view`
dans l'ordre du doctype, largeurs réparties automatiquement) — d'où des formulaires
visuellement différents d'un utilisateur à l'autre.

Pourquoi pas des Property Setters `in_list_view` / `columns` ? Parce qu'ils ne
peuvent pas imposer l'**ordre** des colonnes : sans `GridView`, l'ordre est celui
des champs du doctype, et il diffère de l'ordre voulu sur 4 des 6 grilles ci-dessous
(ex. Écriture de Stock : Article en 1re colonne, alors que le doctype place
Entrepôt source avant). On écrit donc directement le `GridView` de chaque
utilisateur.

La référence est le paramétrage de y.bouram@gmail.com, mais elle est **figée ici en
dur** plutôt que relue en base : sinon dev et prod (bases distinctes) ne donneraient
pas le même résultat. Pour faire évoluer une grille : la régler dans l'UI, puis
reporter les valeurs dans `GRILLES` — c'est ce fichier qui fait foi.

Réappliqué à chaque `bench migrate` (via `after_migrate`), comme le reste de
param_global : un utilisateur qui déplace une colonne la retrouvera donc alignée sur
la référence à la migration suivante. C'est voulu — l'objectif est que tous les
comptes aient le même formulaire.
"""

import json

import frappe

# {doctype parent: {doctype de la table enfant: [(fieldname, largeur), ...]}}
# La largeur est en unités de grille Frappe (12 au total, la 1re étant réservée) ;
# la somme des largeurs d'une grille ne doit pas dépasser 10, sinon `grid.js`
# abandonne le rendu personnalisé (`total_colsize > 11` → return false).
GRILLES = {
    "Delivery Note": {
        "Delivery Note Item": [
            # Article passe de 5 à 4 pour loger le prix d'achat : la somme des
            # largeurs ne peut pas dépasser 10 (cf. commentaire ci-dessus).
            ("item_code", 4),
            ("qty", 1),
            ("rate", 1),
            ("warehouse", 1),
            ("actual_qty", 1),
            ("dernier_prix_achat_ttc", 1),
            ("amount", 1),
        ],
    },
    "Purchase Receipt": {
        # `price_list_rate` (« Prix ») porte le prix BRUT saisi et `discount_percentage`
        # (« Remise % ») la remise fournisseur : ERPNext en déduit `rate` (prix net),
        # hors grille, qui donne le Montant. L'ancienne colonne `discount_amount` était
        # un champ CALCULÉ (price_list_rate − rate) que la saisie ne pilotait pas.
        "Purchase Receipt Item": [
            ("item_code", 4),
            ("qty", 1),
            ("price_list_rate", 1),
            ("prix_ht", 1),
            ("discount_percentage", 1),
            ("amount", 1),
            ("warehouse", 1),
        ],
    },
    "Retour": {
        "Retour Item": [
            ("item_code", 6),
            ("qty", 1),
            ("rate", 1),
            ("amount", 1),
            ("depot_item", 1),
        ],
    },
    "Purchase Order": {
        "Purchase Order Item": [
            ("item_code", 2),
            ("qty", 1),
            ("rate", 2),
            ("amount", 2),
        ],
    },
    "Quotation": {
        "Quotation Item": [
            # Article passe de 5 à 4 et Qté de 2 à 1 pour loger le prix d'achat :
            # la somme des largeurs ne peut pas dépasser 10 (cf. commentaire en
            # tête de fichier), et la grille était déjà pile au plafond.
            ("item_code", 4),
            ("qty", 1),
            ("rate", 2),
            ("dernier_prix_achat_ttc", 2),
            ("amount", 1),
        ],
    },
    "Remise Bancaire": {
        "Remise Bancaire Ligne": [
            ("paiement_bl", 1),
            ("mode_paiement", 1),
            ("date_paiement", 1),
            ("client_name", 1),
            ("numero_reference", 2),
            ("montant", 1),
            ("echeance", 1),
            ("statut", 1),
            ("motif_retour", 1),
        ],
    },
    "Stock Entry": {
        "Stock Entry Detail": [
            ("item_code", 3),
            ("qty", 1),
            ("s_warehouse", 2),
            ("t_warehouse", 2),
        ],
    },
    "Stock Reconciliation": {
        "Stock Reconciliation Item": [
            ("item_code", 5),
            ("warehouse", 3),
            ("qty", 2),
        ],
    },
}


def appliquer_grilles_utilisateurs():
    """Écrit le `GridView` de référence pour chaque utilisateur du desk. Idempotent."""
    utilisateurs = frappe.get_all(
        "User",
        filters={"enabled": 1, "user_type": "System User"},
        pluck="name",
    )
    if not utilisateurs:
        return

    modifies = 0
    for parent, tables in GRILLES.items():
        # Une app peut ne pas être installée sur un site donné (ex. remise_bancaire).
        if not frappe.db.exists("DocType", parent):
            continue

        gridview = _gridview_existant(tables)
        if not gridview:
            continue

        for user in utilisateurs:
            modifies += _ecrire_gridview(user, parent, gridview)

    if modifies:
        frappe.db.commit()


def _gridview_existant(tables):
    """Filtre la référence sur ce qui existe réellement en base (doctypes + champs).

    Évite d'écrire une colonne fantôme si un champ custom a été retiré : `grid.js`
    l'ignorerait, mais autant garder `__UserSettings` propre.
    """
    gridview = {}
    for child, colonnes in tables.items():
        if not frappe.db.exists("DocType", child):
            continue
        meta = frappe.get_meta(child)
        cols = [
            {"fieldname": fieldname, "columns": largeur}
            for fieldname, largeur in colonnes
            if meta.get_field(fieldname)
        ]
        if cols:
            gridview[child] = cols
    return gridview


def _ecrire_gridview(user, parent, gridview):
    """Met à jour la seule clé `GridView` de la ligne `__UserSettings` de l'utilisateur.

    Les autres clés (`last_view`, `List` → filtres et tri, `Report`, `Dashboard`)
    sont préservées : elles restent des préférences personnelles légitimes.
    Retourne 1 si la ligne a été écrite, 0 si elle était déjà conforme.
    """
    ligne = frappe.db.sql(
        "SELECT `data` FROM `__UserSettings` WHERE `user` = %s AND `doctype` = %s",
        (user, parent),
    )

    data = {}
    if ligne and ligne[0][0]:
        try:
            data = json.loads(ligne[0][0])
        except ValueError:
            data = {}
    if not isinstance(data, dict):
        # Anciennes versions de Frappe pouvaient stocker une chaîne JSON imbriquée.
        data = {}

    if data.get("GridView") == gridview:
        return 0

    data["GridView"] = gridview
    frappe.db.sql(
        """INSERT INTO `__UserSettings` (`user`, `doctype`, `data`)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE `data` = VALUES(`data`)""",
        (user, parent, json.dumps(data)),
    )
    # `get_user_settings()` lit d'abord le cache redis : sans invalidation, la
    # session en cours continuerait de servir l'ancienne présentation.
    frappe.cache.hdel("_user_settings", f"{parent}::{user}")
    return 1
