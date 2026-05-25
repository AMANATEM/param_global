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

    frappe.db.commit()
