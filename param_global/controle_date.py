"""Verrou chronologique : la date d'un document doit rester proche du jour même.

Règle métier (décidée le 2026-08-16) : pour un utilisateur ordinaire, la date de
validation d'un document est enfermée dans **[aujourd'hui, demain]** — ni la
veille, ni après-demain. L'annulation, elle, n'a que la borne basse : on ne
revient pas sur une journée passée.

Seul `Administrator` échappe aux deux bornes, mais pas machinalement : une
confirmation l'avertit **avant** le geste (`public/js/pg_controle_date.bundle.js`), pour
qu'il puisse encore renoncer. Ce module reste donc silencieux pour lui.

Deux dangers distincts, d'où deux bornes :

* **La borne basse** empêche qu'une journée déjà close (caisse remise,
  vérification journalière faite) soit rouverte a posteriori par une saisie ou
  une annulation antidatée, qui déplacerait une recette d'un jour sur l'autre.
* **La borne haute** empêche de dater un document d'un jour qui n'est pas encore
  arrivé — la recette s'y rangerait dans une journée que personne ne vérifiera
  avant longtemps. Demain reste autorisé : c'est le cas réel de la livraison
  préparée la veille au soir.

Appliqué aux **neuf** documents soumissionnables du bench (décision du
2026-09-05, qui a étendu la règle telle quelle aux six documents restants) :

===================== ============================ =========================
Document              Champ de date                 App qui pose le hook
===================== ============================ =========================
Delivery Note         ``posting_date``              bon_livraison
Retour                ``date``                      bon_livraison
Paiement BL           ``date``                      bon_livraison
Purchase Receipt      ``posting_date``              bon_reception
Bon E/S               ``posting_date``              bon_reception
Paiement BR           ``date``                      bon_reception
Stock Entry           ``posting_date``              ecriture_stock
Stock Reconciliation  ``posting_date``              reconciliation_stock
Remise Bancaire       ``date``                      remise_bancaire
===================== ============================ =========================

Le Paiement BL porte aussi les mouvements de caisse greffés par l'app `caisse`,
et le Bon E/S est un Purchase Receipt greffé par l'app `bon_es` : un seul hook
sur `Purchase Receipt` couvre les deux, seul le libellé du refus diffère.

⚠️ **Ce module vit dans `param_global` et nulle part ailleurs.** Il était né
dans `bon_livraison` quand il ne servait que la vente ; l'étendre à l'achat et
au stock aurait obligé quatre apps à dépendre de `bon_livraison`, ce que
l'architecture du bench interdit. Même raison d'être que `verrou.py` et
`validation.py`, transverses eux aussi.

⚠️ **Conséquence assumée côté ACHAT** : un Bon de Réception ne peut plus être
validé s'il est daté d'avant aujourd'hui, alors que le bon d'un fournisseur
remonte parfois avec quelques jours de retard. La direction a explicitement
choisi la même règle pour les neuf documents (2026-09-05) ; le contournement est
de dater le BR du jour, ou de le faire valider par l'Administrateur.

**Refus bilingue français + arabe.** Une partie des utilisateurs du comptoir lit
mieux l'arabe ; comme le refus est sec et sans recours possible de leur part, il
doit être compris du premier coup. Les deux versions sont écrites en dur ici
plutôt que passées par le mécanisme de traduction de Frappe : on veut les **deux
langues affichées ensemble**, pas l'une *ou* l'autre selon la langue du compte.
La confirmation destinée à l'Administrateur, elle, est en français seulement —
elle ne s'adresse qu'à un compte unique, dont la langue est connue.
"""

import frappe
from frappe.utils import add_days, formatdate, getdate, today

# Jours autorisés dans le futur : 1 = on peut dater de demain, pas d'après-demain.
LIMITE_FUTUR_JOURS = 1

# Libellé du document dans les deux langues.
#
# ⚠️ Les libellés arabes des six documents ajoutés le 2026-09-05 ont été écrits
# par l'agent, sur le modèle des trois premiers (« سند » + complément). Ils
# méritent une relecture par un lecteur arabophone : c'est ce texte que verra
# quelqu'un à qui l'on refuse un geste, sans recours de sa part.
DOCUMENTS = {
	"bl": {"fr": "Bon de Livraison", "ar": "سند التسليم"},
	"retour": {"fr": "Retour", "ar": "سند الإرجاع"},
	"paiement": {"fr": "Paiement", "ar": "سند الدفع"},
	"br": {"fr": "Bon de Réception", "ar": "سند الاستلام"},
	"bon_es": {"fr": "Bon Entrée/Sortie", "ar": "سند الدخول والخروج"},
	"paiement_br": {"fr": "Paiement fournisseur", "ar": "سند الدفع للمورد"},
	"ecriture": {"fr": "Écriture de Stock", "ar": "سند حركة المخزون"},
	"reconciliation": {"fr": "Réconciliation de Stock", "ar": "سند جرد المخزون"},
	"remise": {"fr": "Remise Bancaire", "ar": "سند الإيداع البنكي"},
}

_VALIDATION = {
	"titre_fr": "Validation impossible",
	"titre_ar": "تعذّر التأكيد",
	"refus_fr": "Validation impossible : ce {doc} est daté du {date}, antérieur à"
	" aujourd'hui ({jour}). Un document d'une journée passée ne peut pas être"
	" validé.",
	"refus_ar": "تعذّر التأكيد: {doc} هذا مؤرّخ بتاريخ {date}، وهو سابق لليوم ({jour})."
	" لا يمكن تأكيد وثيقة تخصّ يوماً منقضياً.",
}

_ANNULATION = {
	"titre_fr": "Annulation impossible",
	"titre_ar": "تعذّر الإلغاء",
	"refus_fr": "Annulation impossible : ce {doc} est daté du {date}, antérieur à"
	" aujourd'hui ({jour}). Un document d'une journée passée ne peut pas être"
	" annulé.",
	"refus_ar": "تعذّر الإلغاء: {doc} هذا مؤرّخ بتاريخ {date}، وهو سابق لليوم ({jour})."
	" لا يمكن إلغاء وثيقة تخصّ يوماً منقضياً.",
}

# Borne haute : un document ne peut pas être daté au-delà de demain.
_FUTUR = {
	"titre_fr": "Date trop lointaine",
	"titre_ar": "تاريخ بعيد جدّاً",
	"refus_fr": "Validation impossible : ce {doc} est daté du {date}. Un document ne"
	" peut pas être daté au-delà de demain ({limite}).",
	"refus_ar": "تعذّر التأكيد: {doc} هذا مؤرّخ بتاريخ {date}. لا يمكن أن يتجاوز تاريخ"
	" الوثيقة يوم غد ({limite}).",
}


#: Clé de `site_config.json` qui LÈVE ce verrou et celui du périmètre de la
#: prime de fidélisation (`commission.fidelite`), le temps d'une campagne de
#: tests : elle permet de dater librement les documents pour rejouer un scénario.
#:
#: ⚠️ ELLE VIT DANS `site_config.json`, HORS GIT, ET C'EST TOUT L'INTÉRÊT. Mettre
#: un drapeau dans le code aurait suffi pour DEV, mais ce drapeau serait parti en
#: production au premier `git pull` — et y aurait ouvert, en silence, la saisie
#: antidatée sur les neuf documents du bench. Ici, la prod n'a pas la clé, donc
#: la promotion de ce code ne change rien pour elle. Même mécanisme, et mêmes
#: raisons, que la clé `environnement` du bandeau DEV.
#:
#: ⚠️ Pour remettre les verrous :
#:     bench --site <site> set-config tests_sans_verrous 0
#: Une valeur fausse suffit, il n'est pas nécessaire de retirer la clé.
CLE_TESTS = "tests_sans_verrous"


def verrous_leves():
	"""Vrai si ce site est en campagne de tests, verrous chronologiques levés."""
	return bool(frappe.conf.get(CLE_TESTS))


def _traitement_systeme():
	"""Vrai hors interaction humaine : migration, patch, import, test.

	Ces traitements manipulent par construction des documents anciens (l'import
	Omag a créé des BL de 2022) : sans cette sortie, un simple `bench migrate`
	échouerait. Testé **avant** le cas Administrator, car ces traitements
	tournent eux aussi sous ce compte — les avertir n'aurait aucun destinataire
	et noierait la sortie du migrate.
	"""
	flags = frappe.flags
	return bool(
		flags.in_install
		or flags.in_migrate
		or flags.in_patch
		or flags.in_import
		or flags.in_test
		# ⚠️ `in_setup_wizard` : l'assistant de configuration crée lui aussi des
		# documents sous `Administrator`, hors de toute interaction humaine. Sans
		# cette sortie, une installation partant de zéro (VM de dev recréée, prod
		# reconstruite) reste bloquée sur l'assistant. Pris sur le fait le 2026-09-06
		# en montant le site de test.
		or flags.in_setup_wizard
	)


def _ltr(texte):
	"""Isole une date dans un texte arabe.

	Sans cette isolation, l'algorithme bidirectionnel réordonne « 15-08-2026 » à
	l'affichage quand il est posé dans un paragraphe RTL — la date se lirait
	« 2026-08-15 » et la personne se tromperait de jour.
	"""
	return f'<span dir="ltr" style="unicode-bidi:isolate">{texte}</span>'


def _bilingue(texte_fr, texte_ar):
	"""Empile la version française puis la version arabe, séparées d'un filet."""
	return (
		f"<div>{texte_fr}</div>"
		f'<div dir="rtl" lang="ar" style="text-align:right;margin-top:.6em;'
		f'padding-top:.6em;border-top:1px solid rgba(0,0,0,.15)">{texte_ar}</div>'
	)


def _libelles(document):
	return DOCUMENTS.get(document, DOCUMENTS["bl"])


def _refuser(action, doc, **dates):
	"""Lève le refus bilingue de `action`, en y injectant les dates fournies.

	Les mêmes dates servent aux deux langues, mais isolées en LTR côté arabe.
	"""
	frappe.throw(
		_bilingue(
			action["refus_fr"].format(doc=doc["fr"], **dates),
			action["refus_ar"].format(
				doc=doc["ar"], **{cle: _ltr(valeur) for cle, valeur in dates.items()}
			),
		),
		title=f"{action['titre_fr']} · {action['titre_ar']}",
	)


# L'Administrateur passe dans tous les cas : c'est à lui de corriger une journée
# close ou de poser une date lointaine. Il n'est pas averti côté serveur mais
# AVANT le geste, par la confirmation posée dans public/js/pg_controle_date.bundle.js — un
# message d'après-coup arriverait trop tard pour qu'il puisse renoncer.


def verifier_date_validation(date_document, document):
	"""Restreint la validation à la fenêtre [aujourd'hui, aujourd'hui + 1].

	Deux bornes, deux motifs distincts : en deçà on rouvre une journée close, au
	delà on date un document d'un jour qui n'existe pas encore. La borne haute
	autorise demain, pour la livraison préparée la veille au soir.
	"""
	if not date_document or _traitement_systeme() or verrous_leves():
		return

	date_document = getdate(date_document)
	aujourdhui = getdate(today())
	limite = add_days(aujourdhui, LIMITE_FUTUR_JOURS)

	if aujourdhui <= date_document <= limite:
		return

	if frappe.session.user == "Administrator":
		return

	doc = _libelles(document)
	if date_document < aujourdhui:
		_refuser(
			_VALIDATION,
			doc,
			date=formatdate(date_document),
			jour=formatdate(aujourdhui),
		)
	else:
		_refuser(
			_FUTUR,
			doc,
			date=formatdate(date_document),
			limite=formatdate(limite),
		)


def verifier_date_annulation(date_document, document):
	"""Bloque l'annulation d'un document daté d'avant aujourd'hui.

	Pas de borne haute ici, contrairement à la validation : une date lointaine
	ne clôt rien, et un document daté au-delà de demain ne peut venir que de
	l'Administrateur — le refuser à l'annulation coincerait tout le monde.
	"""
	if not date_document or _traitement_systeme() or verrous_leves():
		return

	date_document = getdate(date_document)
	aujourdhui = getdate(today())
	if date_document >= aujourdhui:
		return

	if frappe.session.user == "Administrator":
		return

	_refuser(
		_ANNULATION,
		_libelles(document),
		date=formatdate(date_document),
		jour=formatdate(aujourdhui),
	)
