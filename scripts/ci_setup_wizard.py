"""Assistant de configuration pour un site de test — société AMANATEM / AMA.

⚠️ La société DOIT s'appeler AMANATEM et s'abréger AMA. Laissé à lui-même, le
hook `before_tests` d'erpnext crée « Wind Power LLC » d'abrégé « WP » — or
`garage/sync.py` compare LITTÉRALEMENT à « GARAGE - AMA ». Les entrepôts
s'appelleraient « GARAGE - WP » et toute la détection GARAGE deviendrait
intestable.

⚠️ La langue est le français : c'est ce qui fait que les libellés et les
paramètres régionaux correspondent à la production. L'UOM « Unité », elle, n'en
dépend plus — `param_global.install` la crée si elle manque (voir CHANGELOG 1.30.0).

Usage : bench --site <site> console < apps/param_global/scripts/ci_setup_wizard.py
"""

import frappe
from frappe.desk.page.setup_wizard.setup_wizard import setup_complete

setup_complete(
	{
		"currency": "MAD",
		"full_name": "CI",
		"company_name": "AMANATEM",
		"company_abbr": "AMA",
		"timezone": "Africa/Casablanca",
		"country": "Morocco",
		"language": "fr",
		"fy_start_date": "2026-01-01",
		"fy_end_date": "2026-12-31",
		"chart_of_accounts": "Standard",
		"email": "ci@amanatem.local",
		"password": "Admin1234.",
	}
)
frappe.db.commit()
print("SETUP OK — Company:", frappe.db.count("Company"), "| UOM:", frappe.db.count("UOM"))
