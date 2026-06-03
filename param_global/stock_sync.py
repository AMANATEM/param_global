import frappe
from param_global.install import (
	sync_stock_for_items,
	sync_price_list_for_items,
	sync_last_purchase_ttc_for_items,
)


def on_stock_document(doc, method):
	item_codes = list({row.item_code for row in (doc.items or []) if row.item_code})
	if item_codes:
		sync_stock_for_items(item_codes)
		if doc.doctype == "Purchase Receipt":
			sync_last_purchase_ttc_for_items(item_codes)


def on_item_price_change(doc, method):
	if doc.selling and doc.item_code:
		sync_price_list_for_items([doc.item_code])
