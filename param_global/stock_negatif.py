# Masque l'avertissement « Avertissement sur Stock Négatif » d'ERPNext.
#
# ERPNext émet ce message (erpnext/stock/stock_ledger.py, méthode
# `update_entries_after.validate_previous_sle_qty`) dès qu'un mouvement
# **entrant** arrive sur un article dont le solde de l'entrepôt était
# **négatif** — typiquement un Retour client ou un Bon de Réception. Il prévient
# que le taux de valorisation enregistré pour la quantité entrante peut être
# faux, faute de savoir à quel coût valoriser une entrée sur un solde négatif.
#
# Pourquoi on le masque ici : ERPNext ne contient que les mouvements de l'année
# en cours (migration Omag, cf. CLAUDE.md). Les réceptions antérieures qui
# avaient mis la marchandise en stock n'ont jamais été importées, donc
# **58,8 % des articles de PRINCIPAL sont en stock négatif** (2 404 sur 4 087 au
# 2026-07-28). L'avertissement se déclenche donc en permanence, sur une
# situation connue et assumée, et les utilisateurs le referment sans le lire —
# ce qui est pire que pas d'avertissement du tout.
#
# ⚠️ Il ne s'agit que d'un `frappe.msgprint` (indicateur bleu) : le document est
# validé dans tous les cas, rien n'est bloqué. Masquer ce message ne change
# donc **aucun** comportement d'ERPNext, seulement l'affichage. La valorisation
# reste imparfaite sur les articles concernés — c'est la conséquence du
# périmètre de migration retenu, pas de ce patch.
#
# Le jour où PRINCIPAL repartira d'un inventaire physique propre, ce module
# n'aura plus de raison d'être : le retirer (avec les deux hooks associés).
#
# Point d'ancrage : `before_request` + `before_job`, les deux contextes
# d'exécution d'un document (requête web et tâche de fond). Du code au niveau
# module de `hooks.py` ne conviendrait pas — hors `developer_mode`,
# `frappe.get_hooks()` sert les hooks depuis le cache redis et n'importe donc
# pas `hooks.py` à chaque processus.
_PATCH_APPLIQUE = False


def _sans_avertissement(self, sle):
	"""Remplace `validate_previous_sle_qty`, dont le seul effet est le msgprint."""
	return None


def appliquer_patch():
	"""Neutralise l'avertissement. Idempotent, et sans import tant que c'est fait."""
	global _PATCH_APPLIQUE
	if _PATCH_APPLIQUE:
		return

	from erpnext.stock.stock_ledger import update_entries_after

	update_entries_after.validate_previous_sle_qty = _sans_avertissement
	_PATCH_APPLIQUE = True


def avant_requete(*args, **kwargs):
	"""Hook `before_request`."""
	appliquer_patch()


def avant_job(*args, **kwargs):
	"""Hook `before_job`."""
	appliquer_patch()
