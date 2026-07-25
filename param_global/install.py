import frappe

from param_global.grilles import appliquer_grilles_utilisateurs


def after_install():
    apply_global_params()


def after_migrate():
    apply_global_params()


def extend_bootinfo(bootinfo):
    # Nom d'utilisateur (champ `username`) affiché dans le header desk-wide
    # (public/js/ui_defaults.js) — absent du bootinfo standard de Frappe.
    bootinfo.user["username"] = frappe.db.get_value("User", frappe.session.user, "username")


def apply_global_params():
    # Format des nombres : standard français (séparateur milliers « . », décimal
    # « , ») → 1.292,60. S'applique partout : écran, impression, PDF, tous les
    # rapports et apps.
    frappe.db.set_single_value("System Settings", "number_format", "#.###,##")

    # Désactiver la politique de mot de passe (score minimum zxcvbn) : accepte
    # les mots de passe faibles (ex. "123456"), demandé par l'utilisateur pour
    # simplifier la création de comptes de test sur cette instance.
    frappe.db.set_single_value("System Settings", "enable_password_policy", 0)

    # Autoriser la connexion par Nom d'utilisateur (en plus de l'email) : chaque
    # utilisateur doit aussi avoir son champ `username` renseigné pour en profiter.
    frappe.db.set_single_value("System Settings", "allow_login_using_user_name", 1)

    # Autoriser un prix négatif sur une ligne de vente : nécessaire pour les
    # lignes manuelles de type "REMISE" (remise ligne à ligne saisie comme un
    # article manuel à prix négatif dans Omag) — sans ce réglage, ERPNext
    # rejette toute ligne à prix négatif, y compris ces remises légitimes.
    frappe.db.set_single_value("Selling Settings", "allow_negative_rates_for_items", 1)

    # Stock Settings
    frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 1)
    frappe.db.set_single_value("Stock Settings", "stock_uom", "Unité")
    frappe.db.set_default("stock_uom", "Unité")

    # MAD : symbole espace pour ne pas afficher la devise sur les documents
    frappe.db.set_value("Currency", "MAD", "symbol", " ", update_modified=False)

    # Devises : garder uniquement MAD
    currencies_to_delete = frappe.db.get_all("Currency", filters={"name": ["!=", "MAD"]}, pluck="name")
    for currency in currencies_to_delete:
        try:
            frappe.delete_doc("Currency", currency, force=True, ignore_permissions=True)
        except Exception:
            pass

    # Afficher le nom de l'article (item_name) dans tous les champs lien vers Item
    frappe.db.set_value("DocType", "Item", "show_title_field_in_link", 1, update_modified=False)
    frappe.clear_cache(doctype="Item")

    # Naming series articles : numérique pur (000001, 000002, ...)
    frappe.db.set_single_value("Stock Settings", "item_naming_by", "Naming Series")
    frappe.db.set_default("item_naming_by", "Naming Series")
    frappe.db.set_value(
        "DocField",
        {"parent": "Item", "fieldname": "naming_series"},
        {
            "options": "######",
            "default": "######",
        },
        update_modified=False,
    )
    from erpnext.utilities.naming import set_by_naming_series
    set_by_naming_series("Item", "item_code", True, hide_name_field=True, make_mandatory=0)
    frappe.clear_cache(doctype="Item")

    # TVA : supprimer le template 10%, garder uniquement 20%
    for doctype in ("Sales Taxes and Charges Template", "Purchase Taxes and Charges Template"):
        try:
            if frappe.db.exists(doctype, "Morroco VAT 10% - AMA"):
                frappe.delete_doc(doctype, "Morroco VAT 10% - AMA", force=True, ignore_permissions=True)
        except Exception:
            pass

    # TVA 20% : prix TTC (included_in_print_rate) sur les templates Sales et Purchase
    for child_table in ("Sales Taxes and Charges", "Purchase Taxes and Charges"):
        frappe.db.set_value(
            child_table,
            {"parent": "Morroco VAT 20% - AMA", "rate": 20},
            "included_in_print_rate",
            1,
            update_modified=False,
        )

    create_stock_fields()
    sync_stock_items()
    create_price_list_fields()
    sync_price_list_items()
    create_last_purchase_ttc_field()
    sync_last_purchase_ttc_all()
    create_tiers_fields()

    # Présentation identique des grilles (tables enfants des formulaires) pour tous
    # les utilisateurs du desk — cf. grilles.py pour le pourquoi du GridView.
    appliquer_grilles_utilisateurs()

    frappe.db.commit()


# Magasins actifs → fieldname snake_case
STOCK_WAREHOUSES = {
    "DEPOT - AMA": "stock_depot",
    "GARAGE - AMA": "stock_garage",
    "PRINCIPAL - AMA": "stock_principal",
}

# Listes de prix de vente → fieldname
SELLING_PRICE_LISTS = {
    "Vente standard": "prix_vente_standard",
    "Vente2": "prix_vente2",
    "Vente3": "prix_vente3",
}


def create_stock_fields():
    from frappe.custom.doctype.custom_field.custom_field import create_custom_field

    for warehouse, fieldname in STOCK_WAREHOUSES.items():
        label = "Stock " + warehouse.split(" - ")[0].capitalize()
        create_custom_field(
            "Item",
            {
                "fieldname": fieldname,
                "label": label,
                "fieldtype": "Float",
                "read_only": 1,
                "in_list_view": 0,
                "insert_after": "last_purchase_rate",
            },
        )


def create_last_purchase_ttc_field():
    from frappe.custom.doctype.custom_field.custom_field import create_custom_field

    create_custom_field(
        "Item",
        {
            "fieldname": "dernier_prix_achat_ttc",
            "label": "Dernier Prix Achat TTC",
            "fieldtype": "Float",
            "read_only": 1,
            "in_list_view": 0,
            "insert_after": "last_purchase_rate",
        },
    )


def _last_purchase_ttc_fallback():
    """dpa_historique (app article) sert de point de départ tant qu'aucun Bon
    de Réception réel n'a été validé pour l'article ; dès qu'un BR existe, sa
    valeur prend le dessus automatiquement (COALESCE). Le champ appartenant à
    une autre app, on vérifie sa présence pour ne pas casser un site où
    `article` ne serait pas (encore) installée."""
    return "i.`dpa_historique`" if frappe.db.has_column("Item", "dpa_historique") else "0"


def sync_last_purchase_ttc_all():
    """Synchronisation complète — appelée à chaque bench migrate."""
    frappe.db.sql(f"""
        UPDATE `tabItem` i
        SET i.`dernier_prix_achat_ttc` = COALESCE((
            SELECT pri.rate
            FROM `tabPurchase Receipt Item` pri
            JOIN `tabPurchase Receipt` pr ON pr.name = pri.parent
            WHERE pri.item_code = i.name
              AND pr.docstatus = 1
            ORDER BY pr.posting_date DESC, pr.posting_time DESC, pr.creation DESC
            LIMIT 1
        ), {_last_purchase_ttc_fallback()}, 0)
    """)


def sync_last_purchase_ttc_for_items(item_codes):
    """Mise à jour temps réel après submit/cancel d'un BR."""
    if not item_codes:
        return
    placeholders = ", ".join(["%s"] * len(item_codes))
    frappe.db.sql(
        f"""
        UPDATE `tabItem` i
        SET i.`dernier_prix_achat_ttc` = COALESCE((
            SELECT pri.rate
            FROM `tabPurchase Receipt Item` pri
            JOIN `tabPurchase Receipt` pr ON pr.name = pri.parent
            WHERE pri.item_code = i.name
              AND pr.docstatus = 1
            ORDER BY pr.posting_date DESC, pr.posting_time DESC, pr.creation DESC
            LIMIT 1
        ), {_last_purchase_ttc_fallback()}, 0)
        WHERE i.name IN ({placeholders})
        """,
        list(item_codes),
    )
    frappe.db.commit()


def sync_stock_items():
    """Synchronisation complète — appelée à chaque bench migrate."""
    for warehouse, fieldname in STOCK_WAREHOUSES.items():
        frappe.db.sql(
            f"""
            UPDATE `tabItem` i
            LEFT JOIN `tabBin` b ON b.item_code = i.name AND b.warehouse = %s
            SET i.`{fieldname}` = COALESCE(b.actual_qty, 0)
            """,
            (warehouse,),
        )


def create_price_list_fields():
    from frappe.custom.doctype.custom_field.custom_field import create_custom_field

    for price_list, fieldname in SELLING_PRICE_LISTS.items():
        create_custom_field(
            "Item",
            {
                "fieldname": fieldname,
                "label": "Prix " + price_list,
                "fieldtype": "Float",
                "read_only": 1,
                "in_list_view": 0,
                "insert_after": "last_purchase_rate",
            },
        )


def sync_price_list_items():
    """Synchronisation complète des prix de vente — appelée à chaque bench migrate."""
    for price_list, fieldname in SELLING_PRICE_LISTS.items():
        frappe.db.sql(
            f"""
            UPDATE `tabItem` i
            LEFT JOIN `tabItem Price` ip
                ON ip.item_code = i.name
                AND ip.price_list = %s
                AND ip.selling = 1
                AND (ip.valid_upto IS NULL OR ip.valid_upto >= CURDATE())
                AND (ip.valid_from IS NULL OR ip.valid_from <= CURDATE())
            SET i.`{fieldname}` = COALESCE(ip.price_list_rate, 0)
            """,
            (price_list,),
        )


def sync_price_list_for_items(item_codes):
    """Mise à jour temps réel des prix de vente pour une liste d'articles."""
    if not item_codes:
        return
    placeholders = ", ".join(["%s"] * len(item_codes))
    for price_list, fieldname in SELLING_PRICE_LISTS.items():
        frappe.db.sql(
            f"""
            UPDATE `tabItem` i
            LEFT JOIN `tabItem Price` ip
                ON ip.item_code = i.name
                AND ip.price_list = %s
                AND ip.selling = 1
                AND (ip.valid_upto IS NULL OR ip.valid_upto >= CURDATE())
                AND (ip.valid_from IS NULL OR ip.valid_from <= CURDATE())
            SET i.`{fieldname}` = COALESCE(ip.price_list_rate, 0)
            WHERE i.name IN ({placeholders})
            """,
            [price_list] + list(item_codes),
        )
    frappe.db.commit()


def create_tiers_fields():
    from frappe.custom.doctype.custom_field.custom_field import create_custom_field

    create_custom_field(
        "Customer",
        {
            "fieldname": "code_tiers",
            "label": "Code Client",
            "fieldtype": "Data",
            "read_only": 1,
            "in_list_view": 1,
            "insert_after": "customer_name",
            "no_copy": 1,
        },
    )

    create_custom_field(
        "Supplier",
        {
            "fieldname": "code_tiers",
            "label": "Code Fournisseur",
            "fieldtype": "Data",
            "read_only": 1,
            "in_list_view": 1,
            "insert_after": "supplier_name",
            "no_copy": 1,
        },
    )

    create_custom_field(
        "Purchase Receipt",
        {
            "fieldname": "code_fournisseur",
            "label": "Code Fournisseur",
            "fieldtype": "Data",
            "read_only": 1,
            "fetch_from": "supplier.code_tiers",
            "in_list_view": 1,
            "insert_after": "supplier",
            "no_copy": 1,
        },
    )


def sync_stock_for_items(item_codes):
    """Mise à jour temps réel pour une liste d'articles donnée."""
    if not item_codes:
        return
    placeholders = ", ".join(["%s"] * len(item_codes))
    for warehouse, fieldname in STOCK_WAREHOUSES.items():
        frappe.db.sql(
            f"""
            UPDATE `tabItem` i
            LEFT JOIN `tabBin` b ON b.item_code = i.name AND b.warehouse = %s
            SET i.`{fieldname}` = COALESCE(b.actual_qty, 0)
            WHERE i.name IN ({placeholders})
            """,
            [warehouse] + list(item_codes),
        )
    frappe.db.commit()
