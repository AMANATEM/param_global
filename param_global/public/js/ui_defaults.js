// Forcer les valeurs par défaut à chaque chargement du bureau
localStorage.setItem("container_fullwidth", "true");
localStorage.setItem("show_sidebar", "false");

// Réappliquer l'état de la sidebar à chaque navigation SPA
$(document).on("page-change", function () {
	var show_sidebar = JSON.parse(localStorage.getItem("show_sidebar") || "true");
	$(document.body).toggleClass("no-list-sidebar", !show_sidebar);
	if (!show_sidebar) {
		$(".page-container .layout-side-section").css("display", "");
	}
});
