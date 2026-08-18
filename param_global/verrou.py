"""Verrou administrateur — mot de passe redemandé pour les écrans d'argent.

Pourquoi ce module existe : `frappe.permissions.has_permission()` commence par
`if user == "Administrator": return True`. **Aucun rôle, aucune permission ne
peut donc protéger une session Administrator laissée ouverte au comptoir** —
et c'est précisément le risque ici, puisque le patron travaille sous ce compte
et que les 9 comptes du personnel sont tous `System Manager`.

Le verrou est donc un état explicite, tenu côté serveur, que chaque endpoint
sensible consulte lui-même via `exiger()`. Un contrôle posé uniquement côté
navigateur serait un décor : il suffirait d'appeler la méthode whitelistée à la
main pour lire les données.

L'état vit dans redis, indexé sur le **`sid` de la session** : déverrouiller au
bureau ne déverrouille pas le poste du comptoir. Le délai est **absolu** — il
part de la saisie du mot de passe et ne se prolonge pas avec l'activité.
"""

import frappe
from frappe import _
from frappe.utils import cint
from frappe.utils.password import check_password

# Zone → durée du déverrouillage, en secondes. La vérification journalière a
# besoin d'une heure (relevé de caisse, comptage, saisie), les écrans de
# consultation se contentent de 5 minutes.
ZONES = {
	"caisse": 5 * 60,
	"encaissements": 5 * 60,
	"verification": 60 * 60,
}

# Anti-force brute : sans ce compteur, un mot de passe se teste en boucle depuis
# la console du navigateur, le dialogue n'étant qu'un appel whitelisté de plus.
MAX_ESSAIS = 5
BLOCAGE_SECONDES = 15 * 60


def _cle(zone):
	return f"verrou_admin|{frappe.session.sid}|{zone}"


def _cle_essais():
	return f"verrou_admin_essais|{frappe.session.sid}"


def _valider_zone(zone):
	if zone not in ZONES:
		frappe.throw(_("Zone de verrouillage inconnue : {0}").format(zone))
	return zone


@frappe.whitelist()
def etat(zone):
	"""Secondes restantes avant reverrouillage (0 = verrouillé)."""
	_valider_zone(zone)
	if frappe.session.user != "Administrator":
		return {"deverrouille": 0, "restant": 0, "duree": ZONES[zone]}

	restant = _restant(zone)
	return {
		"deverrouille": 1 if restant > 0 else 0,
		"restant": restant,
		"duree": ZONES[zone],
	}


@frappe.whitelist()
def deverrouiller(zone, mot_de_passe):
	"""Ouvre une zone pour la durée prévue, contre le mot de passe Administrator."""
	_valider_zone(zone)

	# Le verrou ne protège que la session Administrator : pour tout autre compte,
	# ce sont les rôles qui ferment ces écrans, et il n'y a rien à ouvrir.
	if frappe.session.user != "Administrator":
		frappe.throw(_("Réservé à l'administrateur."), frappe.PermissionError)

	essais = cint(frappe.cache().get_value(_cle_essais(), expires=True) or 0)
	if essais >= MAX_ESSAIS:
		frappe.throw(
			_("Trop de tentatives. Réessayez dans quelques minutes."), frappe.AuthenticationError
		)

	try:
		check_password("Administrator", mot_de_passe or "")
	except frappe.AuthenticationError:
		frappe.cache().set_value(_cle_essais(), essais + 1, expires_in_sec=BLOCAGE_SECONDES)
		frappe.throw(_("Mot de passe incorrect."), frappe.AuthenticationError)

	frappe.cache().delete_value(_cle_essais())
	frappe.cache().set_value(_cle(zone), 1, expires_in_sec=ZONES[zone])
	return etat(zone)


@frappe.whitelist()
def verrouiller(zone):
	"""Reverrouillage manuel, sans attendre l'expiration."""
	_valider_zone(zone)
	frappe.cache().delete_value(_cle(zone))
	return {"deverrouille": 0, "restant": 0, "duree": ZONES[zone]}


def est_deverrouille(zone):
	"""True si la zone est ouverte pour la session courante."""
	_valider_zone(zone)
	if frappe.session.user != "Administrator":
		return False
	return _existe(zone)


def exiger(zone):
	"""Garde-fou serveur : à appeler en tête de tout endpoint sensible."""
	if not est_deverrouille(zone):
		frappe.throw(
			_("Écran verrouillé. Saisissez le mot de passe administrateur pour y accéder."),
			frappe.PermissionError,
		)


def appel_direct(*methodes):
	"""True si la requête HTTP courante vise l'une de ces méthodes whitelistées.

	Sert à ne verrouiller que les appels venant du navigateur : `verification`
	appelle les fonctions de `caisse` en interne (Python), et un garde-fou aveugle
	casserait la vérification journalière dès que la zone `caisse` est fermée.
	"""
	cmd = (frappe.local.form_dict or {}).get("cmd") if hasattr(frappe.local, "form_dict") else None
	return cmd in methodes


def _existe(zone):
	return _restant(zone) > 0


def _restant(zone):
	"""Secondes restantes lues directement sur le TTL redis de la clé.

	`get_value()` mémorise la valeur dans `frappe.local.cache` pour la durée de
	la requête ; c'est le TTL, et lui seul, qui porte l'expiration — d'où la
	lecture directe via `ttl()` sur la clé namespacée par `make_key()`.
	"""
	cache = frappe.cache()
	try:
		restant = cint(cache.ttl(cache.make_key(_cle(zone))))
	except Exception:
		return 0
	return restant if restant > 0 else 0
