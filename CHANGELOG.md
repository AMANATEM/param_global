# Changelog

Toutes les modifications notables de l'app **Param Global** sont documentées ici.

---

## [1.6.0] - 2026-06-11

### Exception barre latérale sur la vue impression

- `ui_defaults.js` : la barre latérale reste masquée par défaut, **sauf sur la vue impression** (route `print/...`). Ajout de `_pg_is_print_view()` ; `_pg_apply()` force l'affichage visuel de `.layout-side-section` sur cette route — sans modifier la préférence stockée `pg_show_sidebar`. Permet de choisir le format d'impression (le sélecteur se trouve dans cette barre).

---

## [1.5.0] - 2026-06-09

### Format des nombres — standard français

- `System Settings.number_format` forcé à `#.###,##` dans `apply_global_params()`
  → tous les nombres s'affichent au format français (`1.292,60`, `120,00`)
  partout : écran, impression, PDF, tous les rapports et apps.

## [1.4.0] - 2026-06-05

### Codes tiers : Client et Fournisseur

- Champ custom `code_tiers` (Data, read-only, `in_list_view`) ajouté sur **Customer** et **Supplier**
- Auto-incrément à la création : `C.######` pour les clients (C000001…), `F.######` pour les fournisseurs (F000001…) via hook `before_insert`
- Champ custom `code_fournisseur` (fetch depuis `supplier.code_tiers`, `in_list_view`) ajouté sur **Purchase Receipt**
- Patch `init_code_tiers` : rétro-remplissage de tous les clients et fournisseurs existants
- Patch `init_code_fournisseur_br` : rétro-remplissage de tous les bons de réception existants

---

## [1.3.0] - 2026-06-03

### Ajouté
- Liste Article : recherche multi-tokens sur "Nom de l'article" (tokens dans n'importe quel ordre)
- Liste Article : tri par défaut ID décroissant, réinitialisé au reload et au bouton Refresh
- Champs custom read-only sur Item pour les colonnes de liste :
  - `stock_depot`, `stock_garage`, `stock_principal` — stock par magasin
  - `prix_vente_standard`, `prix_vente2`, `prix_vente3` — prix de vente par liste
  - `dernier_prix_achat_ttc` — dernier prix d'achat TTC (depuis le dernier BR validé)
- Mise à jour en temps réel via `doc_events` sur Purchase Receipt, Delivery Note, Stock Entry, Purchase Invoice, Sales Invoice, Stock Reconciliation et Item Price

---

## [1.2.3] - 2026-06-03

### Corrigé

- Barre latérale toujours cachée par défaut, y compris pour les documents existants (Brouillon, Validé, Annulé) et après un rechargement de page
- Cause : le CSS natif `no-list-sidebar` de Frappe v15 ne couvre que les pages `List/` ; pour les formulaires, Frappe applique un `display` inline via `sidebar_wrapper.toggle()` qui ignorait notre classe
- Fix : injection CSS `body.pg-no-sidebar .layout-side-section { display: none !important }` + écoute des événements `toggleSidebar` / `toggleListSidebar` déclenchés par les boutons toggle de Frappe ; `pg_show_sidebar` réinitialisé à `false` à chaque rechargement du desk

---

## [1.2.2] - 2026-05-28

### Suppression du flash « Espace de Travail » au chargement de la page Workspaces

Frappe posait un titre générique `__("Workspace")` (= « Espace de Travail » en français) sur la page Workspaces à la création via `make_app_page` (page.js l.119), puis le remplaçait par le nom de la workspace courante (~1 s plus tard, via `workspace.js` l.329 : `this.page.set_title(__(page.name))`). Résultat : un flash visible « Espace de Travail » → « Accueil » à chaque ouverture du desk.

Fix : dans `ui_defaults.js`, un wrapper sur `frappe.standard_pages.Workspaces` intercepte temporairement `frappe.ui.make_app_page` lors de la création de la page Workspaces et force `opts.title = ""`. Comme la ligne 119 de `page.js` saute le rendu si `title` est falsy (`if (this.title) this.set_title(this.title)`), rien n'est rendu pendant le chargement. Le `set_title(__(page.name))` ultérieur affiche directement « Accueil ».

Le wrapper utilise `Object.defineProperty` avec un setter pour couvrir les deux ordres de chargement possibles (notre script avant ou après `workspace.js`).

#### Effet secondaire

L'onglet du navigateur reste brièvement vide avant de devenir « Accueil » (au lieu d'afficher « Espace de Travail » puis « Accueil »). Acceptable.

#### Fichiers

- **`public/js/ui_defaults.js`** : wrapper sur `frappe.standard_pages.Workspaces`

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
