app_name = "param_global"
app_title = "Param Global"
app_publisher = "Amanatem"
app_description = "Parametres Globaux ERPNext"
app_email = "y.bouram@gmail.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "param_global",
# 		"logo": "/assets/param_global/logo.png",
# 		"title": "Param Global",
# 		"route": "/param_global",
# 		"has_permission": "param_global.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/param_global/css/param_global.css"
# Bundle (et non chemin /assets brut) : `bundled_asset()` ne versionne QUE les
# entrées « *.bundle.js » (résolues via assets.json vers le fichier haché) ; un
# chemin /assets brut est servi SANS ?ver=, figé par le cache navigateur 1 an
# (même correctif que bon_livraison/qz_print.bundle.js). Nom préfixé « pg_ » :
# assets.json indexe les bundles par nom de fichier à plat, toutes apps confondues.
app_include_js = [
	"pg_ui_defaults.bundle.js",
	"pg_export_defaults.bundle.js",
	"pg_link_search.bundle.js",
	"pg_nombres.bundle.js",
	"pg_verrou.bundle.js",
	"pg_grille_entree.bundle.js",
	"pg_tri_dropdown.bundle.js",
	"pg_environnement.bundle.js",
]

# include js, css files in header of web template
# web_include_css = "/assets/param_global/css/param_global.css"
# web_include_js = "/assets/param_global/js/param_global.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "param_global/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
doctype_list_js = {"Item": "public/js/item_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "param_global/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "param_global.utils.jinja_methods",
# 	"filters": "param_global.utils.jinja_filters"
# }

# Installation
# ------------

after_install = "param_global.install.after_install"
after_migrate = "param_global.install.after_migrate"

extend_bootinfo = "param_global.install.extend_bootinfo"

# Neutralise l'avertissement « Stock Négatif » d'ERPNext, omniprésent tant que
# PRINCIPAL n'a pas d'inventaire d'ouverture (voir param_global/stock_negatif.py).
# Les deux hooks couvrent les deux contextes d'exécution : requête web et tâche
# de fond. Un simple import au niveau module ne suffirait pas — hors
# developer_mode, `get_hooks()` sert le cache redis sans importer `hooks.py`.
before_request = ["param_global.stock_negatif.avant_requete"]
before_job = ["param_global.stock_negatif.avant_job"]

doc_events = {
	"Customer": {
		"before_insert": "param_global.tiers.before_insert_customer",
	},
	"Supplier": {
		"before_insert": "param_global.tiers.before_insert_supplier",
	},
	"Purchase Receipt": {
		"on_submit": "param_global.stock_sync.on_stock_document",
		"on_cancel": "param_global.stock_sync.on_stock_document",
	},
	"Delivery Note": {
		"on_submit": "param_global.stock_sync.on_stock_document",
		"on_cancel": "param_global.stock_sync.on_stock_document",
	},
	"Stock Entry": {
		"on_submit": "param_global.stock_sync.on_stock_document",
		"on_cancel": "param_global.stock_sync.on_stock_document",
	},
	"Purchase Invoice": {
		"on_submit": "param_global.stock_sync.on_stock_document",
		"on_cancel": "param_global.stock_sync.on_stock_document",
	},
	"Sales Invoice": {
		"on_submit": "param_global.stock_sync.on_stock_document",
		"on_cancel": "param_global.stock_sync.on_stock_document",
	},
	"Stock Reconciliation": {
		"on_submit": "param_global.stock_sync.on_stock_document",
		"on_cancel": "param_global.stock_sync.on_stock_document",
	},
	"Item Price": {
		"on_save": "param_global.stock_sync.on_item_price_change",
		"on_trash": "param_global.stock_sync.on_item_price_change",
	},
}

# Uninstallation
# ------------

# before_uninstall = "param_global.uninstall.before_uninstall"
# after_uninstall = "param_global.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "param_global.utils.before_app_install"
# after_app_install = "param_global.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "param_global.utils.before_app_uninstall"
# after_app_uninstall = "param_global.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "param_global.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"param_global.tasks.all"
# 	],
# 	"daily": [
# 		"param_global.tasks.daily"
# 	],
# 	"hourly": [
# 		"param_global.tasks.hourly"
# 	],
# 	"weekly": [
# 		"param_global.tasks.weekly"
# 	],
# 	"monthly": [
# 		"param_global.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "param_global.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "param_global.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "param_global.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["param_global.utils.before_request"]
# after_request = ["param_global.utils.after_request"]

# Job Events
# ----------
# before_job = ["param_global.utils.before_job"]
# after_job = ["param_global.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"param_global.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

