"""Outils communs aux tests de fonctions pures.

⚠️ Beaucoup de garde-fous du bench sortent d'office quand `frappe.flags.in_test`
est vrai — c'est la parade qui empêche un `bench migrate` d'échouer. Les tester
suppose donc de baisser ce drapeau ET de quitter le compte `Administrator`, qui
passe partout. Sans les deux, le test s'exécute et ne prouve RIEN.
"""

from contextlib import contextmanager

import frappe

UTILISATEUR_ORDINAIRE = "_test_utilisateur_ordinaire@example.com"


def creer_utilisateur_ordinaire(profil="Comptable"):
	"""Un compte non-Administrator, avec un profil pour satisfaire `profils`."""
	if frappe.db.exists("User", UTILISATEUR_ORDINAIRE):
		return UTILISATEUR_ORDINAIRE
	frappe.get_doc(
		{
			"doctype": "User",
			"email": UTILISATEUR_ORDINAIRE,
			"first_name": "Ordinaire",
			"profil_amanatem": profil,
		}
	).insert(ignore_permissions=True)
	return UTILISATEUR_ORDINAIRE


@contextmanager
def utilisateur_reel(utilisateur=None, profil="Comptable"):
	"""Exécute le bloc sous un compte ordinaire, `in_test` baissé.

	Les deux vont ensemble : baisser le drapeau sans changer de compte laisserait
	`Administrator` court-circuiter le contrôle, changer de compte sans baisser le
	drapeau laisserait la sortie « traitement système » l'emporter.
	"""
	utilisateur = utilisateur or creer_utilisateur_ordinaire(profil)
	precedent = frappe.session.user
	frappe.flags.in_test = False
	frappe.set_user(utilisateur)
	try:
		yield utilisateur
	finally:
		frappe.set_user(precedent)
		frappe.flags.in_test = True
