"""Fuseau horaire de l'instance : +00 permanent, sous le nom `Africa/Abidjan`.

Le Maroc est passé à l'heure GMT (+00) de façon PERMANENTE le 2026-09-20
(tzdata 2026c : « Morocco moves to permanent +00 on 2026-09-20 »). Mais les deux
tables de fuseaux qu'utilise Frappe sont antérieures à ce changement et croient
toujours `Africa/Casablanca` à +01 :

- côté serveur, `pytz`, épinglé par Frappe à `==2025.2` (tzdata 2025b) — une mise
  à jour à la main serait défaite par le prochain `bench update` ;
- côté navigateur, `moment-timezone` 0.5.43 (2023), compilé dans les bundles de
  Frappe.

Résultat constaté le 2026-11-14 : tout ERPNext avait UNE HEURE D'AVANCE depuis le
20/09 — heures de saisie, « Validé le », création, et entre 23h et minuit le
desk se croyait déjà au lendemain (date par défaut des documents, verrou
chronologique).

`Africa/Abidjan` est GMT sans heure d'été dans les deux tables, anciennes comme
récentes : c'est exactement l'heure légale du Maroc aujourd'hui. Le libellé est
le prix à payer. ⚠️ Si le Maroc revenait un jour à +01, il faudrait repasser
`FUSEAU` sur `Africa/Casablanca` — et ce, seulement une fois `pytz` et
`moment-timezone` à jour.

Le réglage est posé à TROIS endroits, faute de quoi il ne prend qu'à moitié :

1. `System Settings.time_zone` (tabSingles) et le défaut global `__default`
   (tabDefaultValue), lu par `frappe.boot.sysdefaults` ;
2. `User.time_zone` de chaque compte — sinon le desk voit un fuseau utilisateur
   (Casablanca, +01) différent du fuseau système (+00) et DÉCALE l'affichage de
   toutes les dates d'une heure (`frappe.datetime.convert_to_user_tz`) ;
3. le défaut `time_zone` par utilisateur dans tabDefaultValue, que
   `User.on_update` y recopie.

Un compte créé après coup hérite du fuseau système (`User.set_time_zone`).

On ne remplace que `Africa/Casablanca` : un compte réglé volontairement sur un
autre fuseau n'est pas touché. Les heures déjà enregistrées entre le 20/09 et le
premier migrate qui joue ce module gardent leur heure d'avance — ce sont des
données, on ne les réécrit pas.

Réappliqué à chaque `bench migrate`, idempotent.
"""

import frappe

FUSEAU = "Africa/Abidjan"
ANCIEN = "Africa/Casablanca"


def appliquer_fuseau():
    deja = (
        frappe.db.get_single_value("System Settings", "time_zone") == FUSEAU
        and frappe.db.get_default("time_zone") == FUSEAU
        and not frappe.db.exists("User", {"time_zone": ANCIEN})
        and not frappe.db.exists("DefaultValue", {"defkey": "time_zone", "defvalue": ANCIEN})
    )
    if deja:
        return

    frappe.db.set_single_value("System Settings", "time_zone", FUSEAU)
    frappe.db.set_default("time_zone", FUSEAU)

    frappe.db.sql("UPDATE `tabUser` SET time_zone = %s WHERE time_zone = %s", (FUSEAU, ANCIEN))
    frappe.db.sql(
        "UPDATE `tabDefaultValue` SET defvalue = %s WHERE defkey = 'time_zone' AND defvalue = %s",
        (FUSEAU, ANCIEN),
    )
    frappe.db.commit()

    # `get_system_timezone()` et le bootinfo (user_info) sont en cache redis.
    frappe.cache.delete_value("time_zone")
    frappe.clear_cache()
