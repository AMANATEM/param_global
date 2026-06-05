import frappe
from frappe.model.naming import make_autoname


def before_insert_customer(doc, method):
	if not doc.code_tiers:
		doc.code_tiers = make_autoname("C.######")


def before_insert_supplier(doc, method):
	if not doc.code_tiers:
		doc.code_tiers = make_autoname("F.######")
