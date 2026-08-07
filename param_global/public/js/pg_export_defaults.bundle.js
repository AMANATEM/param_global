// Pré-cochage des colonnes dans la boîte « Exporter des données ».
//
// Par défaut, Frappe fait « on_page_show: () => this.select_mandatory() »
// (data_exporter.js) : à chaque ouverture il décoche TOUT puis ne recoche que
// les champs obligatoires. Les colonnes réellement affichées dans la liste
// (Code Client, Tél, Statut…) doivent alors être cochées à la main.
//
// Ici on garde les obligatoires (le fichier reste réimportable) et on ajoute
// les colonnes de la liste courante, lues dans cur_list.columns.
//
// La classe DataExporter vit dans « data_import_tools.bundle.js », chargé à la
// demande : on ne peut donc pas la patcher au boot. On pose un accesseur sur
// frappe.data_import qui enveloppe la classe au moment où le bundle l'affecte.

frappe.provide("frappe.data_import");

// La colonne Statut est un indicateur Frappe sans champ derrière : on exporte
// le champ qui la porte, quand il existe sur le doctype.
const PG_CHAMPS_STATUT = ["status", "disabled"];

function pg_colonnes_liste(doctype) {
	const liste = window.cur_list;
	if (!liste || liste.doctype !== doctype || !Array.isArray(liste.columns)) {
		return [];
	}

	const noms = [];
	liste.columns.forEach((colonne) => {
		if (colonne.df && colonne.df.fieldname) {
			noms.push(colonne.df.fieldname);
		} else if (colonne.type === "Status") {
			noms.push(...PG_CHAMPS_STATUT);
		}
	});
	return noms;
}

function pg_enveloppe_exportateur(classe) {
	if (!classe || classe.pg_colonnes_pre_cochees) {
		return classe;
	}

	const enveloppe = class extends classe {
		make_dialog() {
			super.make_dialog();

			// Type de fichier : Excel par défaut au lieu de CSV.
			// Frappe déclare `default: "CSV"` en dur dans data_exporter.js ; on ne
			// touche pas au coeur, on repose la valeur juste après la construction
			// de la boîte. `set_value` (et non un simple .val()) pour que le champ
			// Select et le modèle du dialogue restent cohérents.
			if (this.dialog.get_field("file_type")) {
				this.dialog.set_value("file_type", "Excel");
			}

			// on_page_show est déclenché sur « shown.bs.modal », donc après le
			// retour de make_dialog() : on s'enchaîne dessus, sauf si la boîte
			// est déjà affichée (l'événement est alors déjà passé).
			const precedent = this.dialog.on_page_show;
			this.dialog.on_page_show = () => {
				precedent && precedent();
				this.pg_cocher_colonnes_liste();
			};
			if (this.dialog.display) {
				this.pg_cocher_colonnes_liste();
			}
		}

		pg_cocher_colonnes_liste() {
			const champ = this.dialog && this.dialog.get_field(this.doctype);
			if (!champ || !champ.options) {
				return;
			}

			const noms = pg_colonnes_liste(this.doctype);
			if (!noms.length) {
				return;
			}

			const cases = champ.options
				.filter((option) => noms.includes(option.value))
				.map((option) => option.$checkbox && option.$checkbox.find("input").get(0))
				.filter(Boolean);

			$(cases).prop("checked", true).trigger("change");
		}
	};

	enveloppe.pg_colonnes_pre_cochees = true;
	return enveloppe;
}

$(function () {
	let classe = pg_enveloppe_exportateur(frappe.data_import.DataExporter);

	Object.defineProperty(frappe.data_import, "DataExporter", {
		configurable: true,
		enumerable: true,
		get: () => classe,
		set: (nouvelle) => {
			classe = pg_enveloppe_exportateur(nouvelle);
		},
	});
});
