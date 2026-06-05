import frappe


def execute():
	frappe.db.sql(
		"""
		UPDATE `tabPurchase Receipt` pr
		JOIN `tabSupplier` s ON s.name = pr.supplier
		SET pr.code_fournisseur = s.code_tiers
		WHERE (pr.code_fournisseur IS NULL OR pr.code_fournisseur = '')
		  AND s.code_tiers IS NOT NULL
		  AND s.code_tiers != ''
		"""
	)
	frappe.db.commit()
