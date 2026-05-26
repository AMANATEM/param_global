# Changelog

Toutes les modifications notables de l'app **Param Global** sont documentées ici.

---

## [1.2.1] - 2026-05-26

### Affichage du nom article dans les champs lien

- **`install.py`** : active `show_title_field_in_link = 1` sur le DocType `Item` — Frappe affiche désormais `item_name` (nom article) à la place du code dans tous les champs lien vers Item (grilles BL, commandes, factures, etc.), aussi bien dans l'input après sélection que dans la vue compacte des lignes. Idempotent : réappliqué à chaque `bench migrate`.

---

## [1.2.0] - 2026-05-25

### TVA

- **Suppression du template 10%** : `Morroco VAT 10% - AMA` supprimé (Sales + Purchase) — seule la TVA 20% reste
- **Prix TTC par défaut** : `included_in_print_rate = 1` activé sur `Morroco VAT 20% - AMA` (Sales + Purchase) — le prix saisi est désormais traité comme TTC, le HT est rétrocal culé automatiquement

---

## [1.1.0] - 2026-05-25

### Naming Series Articles

- **Naming series activée** : `Stock Settings.item_naming_by = "Naming Series"` (via `set_single_value` + `set_default`)
- **Format numérique pur** : série `######` → premier article `000001`
- **Property Setters** : `item_code` masqué, `naming_series` affiché (via `set_by_naming_series`)

### Interface utilisateur

- **Plein écran par défaut** : `localStorage.container_fullwidth = "true"` à chaque chargement du bureau
- **Barre latérale cachée par défaut** : `localStorage.show_sidebar = "false"` + listener `page-change` pour réappliquer l'état sur chaque navigation SPA

---

## [1.0.0] - 2026-05-24

### Initialisation de l'app

Création de l'app `param_global` dédiée à la gestion des paramètres globaux ERPNext via le mécanisme de custom app (aucune modification manuelle).

### Paramètres Stock

- **Stock négatif activé** : `Stock Settings.allow_negative_stock = 1`
- **UdM par défaut** : `Stock Settings.stock_uom = "Unité"` et mise à jour du default système (`tabDefaultValue`)

### Devises

- **Suppression de toutes les devises** sauf MAD
- **Symbole MAD** : remplacé par un espace `" "` pour ne pas afficher la devise sur les documents (BL, factures, etc.)
