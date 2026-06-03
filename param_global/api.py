import frappe


@frappe.whitelist()
def recherche_article_liste(txt):
	"""Recherche multi-tokens sur code et libellé article (ordre indifférent)."""
	tokens = [t.strip().lower() for t in (txt or "").split() if t.strip()]
	if not tokens:
		return []

	conditions = " AND ".join(
		"(LOWER(name) LIKE %s OR LOWER(item_name) LIKE %s)" for _ in tokens
	)
	params = []
	for token in tokens:
		params.extend([f"%{token}%", f"%{token}%"])

	rows = frappe.db.sql(
		f"SELECT name FROM `tabItem` WHERE disabled = 0 AND ({conditions}) ORDER BY name LIMIT 500",
		params,
	)
	return [r[0] for r in rows]
