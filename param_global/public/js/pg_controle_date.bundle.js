// Confirmation « journée déjà close » — volet client du verrou chronologique
// implémenté côté serveur dans param_global/controle_date.py.
//
// Le serveur refuse purement et simplement qu'un utilisateur ordinaire valide ou
// annule un document daté d'avant aujourd'hui. L'Administrateur, lui, passe —
// c'est à lui de corriger une journée close — mais il est arrêté ici par une
// confirmation AVANT que le geste ne parte, tant qu'il peut encore renoncer.
//
// En français seulement, contrairement au refus serveur qui est bilingue : ce
// message ne s'adresse qu'à un compte unique, dont la langue est connue.
//
// Branché sur les événements before_submit / before_cancel du formulaire. Frappe
// exécute ces handlers en série et attend la promesse retournée (script_manager
// .trigger → frappe.run_serially), puis interrompt le geste si `frappe.validated`
// est retombé à faux — c'est ce qui rend la confirmation réellement bloquante.

frappe.provide("param_global.controle_date");

param_global.controle_date = {
	LIBELLES: {
		bl: "Bon de Livraison",
		retour: "Retour",
		paiement: "Paiement",
		br: "Bon de Réception",
		bon_es: "Bon Entrée/Sortie",
		paiement_br: "Paiement fournisseur",
		ecriture: "Écriture de Stock",
		reconciliation: "Réconciliation de Stock",
		remise: "Remise Bancaire",
	},

	// document : une clé de LIBELLES  ·  geste : "valider" | "annuler"
	confirmer_date_hors_fenetre: function (frm, document, geste, fieldname) {
		const date_doc = frm.doc[fieldname || "date"];

		// ⚠️ Campagne de tests : le serveur ne refuse plus rien (clé
		// `tests_sans_verrous` de site_config.json, cf. `controle_date.py`), donc
		// une confirmation ne protégerait plus de rien — elle ne serait que de la
		// friction sur chaque document rejoué. Absente en production, la clé y
		// laisse ce garde-fou intact.
		if (frappe.boot && frappe.boot.tests_sans_verrous) {
			return;
		}

		// Pour tout autre compte, c'est le serveur qui tranche (et qui refuse) :
		// inutile de demander une confirmation à quelqu'un qui n'ira pas au bout.
		if (frappe.session.user !== "Administrator") {
			return;
		}
		if (!date_doc) {
			return;
		}

		// Comparaisons de chaînes « AAAA-MM-JJ » : l'ordre lexicographique y est
		// l'ordre chronologique.
		const aujourdhui = frappe.datetime.get_today();
		const demain = frappe.datetime.add_days(aujourdhui, 1);

		let titre;
		let situation;
		if (date_doc < aujourdhui) {
			titre = "Journée déjà close.";
			situation = "une journée antérieure à aujourd'hui";
		} else if (geste !== "annuler" && date_doc > demain) {
			// Pas de borne haute à l'annulation : une date lointaine ne clôt rien.
			titre = "Date trop lointaine.";
			situation = "au-delà de demain";
		} else {
			return;
		}

		const libelle = this.LIBELLES[document] || this.LIBELLES.bl;
		const jour = frappe.datetime.str_to_user(date_doc);
		const question = geste === "annuler" ? "Annuler quand même ?" : "Valider quand même ?";

		const message = `
			<b>${titre}</b><br><br>
			Ce ${libelle} est daté du <b>${jour}</b>, ${situation}.<br><br>
			<b>${question}</b>`;

		// Le geste est refusé par défaut : si la boîte est fermée d'une manière
		// que l'on n'a pas prévue, on ne valide pas par accident.
		frappe.validated = false;

		return new Promise((resolve) => {
			frappe.confirm(
				message,
				() => {
					frappe.validated = true;
					resolve();
				},
				// Rappelé aussi bien sur « Non » que sur une fermeture par la croix
				// ou par Échap (frappe.confirm branche onhide quand ce callback est
				// fourni) — sans lui, la promesse ne se résoudrait jamais et le
				// formulaire resterait figé.
				() => {
					frappe.validated = false;
					resolve();
				}
			);
		});
	},
};

// ── Branchement automatique des documents ajoutés le 2026-09-05 ────────────
//
// Les trois documents de vente (BL, Retour, Paiement BL) appellent le helper
// depuis leur PROPRE fichier de formulaire, où la confirmation s'insère dans
// une séquence qui leur est particulière. Les six autres n'ont rien de tel :
// on les branche ici, une fois pour toutes.
//
// ⚠️ Ne JAMAIS ajouter les trois premiers à cette table : leur formulaire
// appelle déjà le helper, et la confirmation s'afficherait deux fois.
//
// ⚠️ Le Bon E/S est un Purchase Receipt greffé par l'app `bon_es` : les deux
// partagent donc ce seul branchement, et le libellé se choisit sur
// `type_operation` — exactement comme côté serveur.

param_global.controle_date.DOCUMENTS_AUTO = {
	"Purchase Receipt": {
		champ: "posting_date",
		// ⚠️ Rien à confirmer en VALIDANT un vrai Bon de Réception : le bon du
		// fournisseur remonte parfois avec quelques jours de retard, la
		// validation antidatée y est normale (décision du 2026-09-05), et le
		// serveur ne la refuse pas non plus. Le Bon E/S, lui, garde la règle.
		cle_valider: (doc) => (doc.type_operation === "Bon E/S" ? "bon_es" : null),
		cle_annuler: (doc) => (doc.type_operation === "Bon E/S" ? "bon_es" : "br"),
	},
	"Paiement BR": {
		champ: "date",
		cle_valider: () => "paiement_br",
		cle_annuler: () => "paiement_br",
	},
	"Stock Entry": {
		champ: "posting_date",
		cle_valider: () => "ecriture",
		cle_annuler: () => "ecriture",
	},
	"Stock Reconciliation": {
		champ: "posting_date",
		cle_valider: () => "reconciliation",
		cle_annuler: () => "reconciliation",
	},
	"Remise Bancaire": { champ: "date", cle_valider: () => "remise", cle_annuler: () => "remise" },
};

$.each(param_global.controle_date.DOCUMENTS_AUTO, function (doctype, conf) {
	const brancher = (choisir_cle, geste) =>
		function (frm) {
			// `null` = ce geste n'est pas soumis au verrou pour ce document.
			const cle = choisir_cle(frm.doc);
			if (!cle) return;
			return param_global.controle_date.confirmer_date_hors_fenetre(
				frm,
				cle,
				geste,
				conf.champ
			);
		};
	frappe.ui.form.on(doctype, {
		before_submit: brancher(conf.cle_valider, "valider"),
		before_cancel: brancher(conf.cle_annuler, "annuler"),
	});
});
