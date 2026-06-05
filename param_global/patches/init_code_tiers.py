import frappe
from frappe.model.naming import make_autoname


def execute():
	# Le patch tourne avant after_migrate : créer les champs ici pour que les colonnes existent.
	from param_global.install import create_tiers_fields
	create_tiers_fields()
	frappe.db.commit()

	customers = frappe.db.get_all(
		"Customer",
		filters=[["code_tiers", "in", ["", None]]],
		pluck="name",
		order_by="creation asc",
	)
	for name in customers:
		frappe.db.set_value(
			"Customer", name, "code_tiers", make_autoname("C.######"), update_modified=False
		)

	suppliers = frappe.db.get_all(
		"Supplier",
		filters=[["code_tiers", "in", ["", None]]],
		pluck="name",
		order_by="creation asc",
	)
	for name in suppliers:
		frappe.db.set_value(
			"Supplier", name, "code_tiers", make_autoname("F.######"), update_modified=False
		)

	frappe.db.commit()
