"""Coupe le son du desk (validation, annulation, erreur…) pour tous les
utilisateurs — c'est un réglage natif Frappe (`User.mute_sounds`), par
utilisateur, sans équivalent système global. Transverse comme le reste de
`param_global` : pas de domaine métier propriétaire de ce réglage.

Un Property Setter positionne aussi le défaut du champ à 1 côté DocType, pour
que tout nouvel utilisateur créé après coup hérite du son coupé sans attendre
le prochain migrate. Réappliqué à chaque `bench migrate` (comme `grilles.py`),
idempotent.
"""

import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter


def appliquer_son_muet():
    make_property_setter("User", "mute_sounds", "default", "1", "Data", for_doctype=False)

    frappe.db.sql(
        "UPDATE `tabUser` SET mute_sounds = 1"
        " WHERE enabled = 1 AND user_type = 'System User' AND mute_sounds != 1"
    )
    frappe.db.commit()
