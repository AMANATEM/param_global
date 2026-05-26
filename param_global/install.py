import frappe


def after_install():
    apply_global_params()


def after_migrate():
    apply_global_params()


def apply_global_params():
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

    frappe.db.commit()
