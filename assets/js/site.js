/*
	Loom Robotics — shared chrome renderer (no build step)

	Renders the header, nav, footer, and copyright from window.LOOM
	(assets/js/site.config.js) into the page's mount points:

		<div data-loom="header"></div>
		<div data-loom="nav"></div>
		<div data-loom="footer"></div>
		<div data-loom="copyright"></div>

	Load order on each page (just before the template scripts):
		1. site.config.js   — the data
		2. site.js          — this renderer (runs synchronously, replaces mounts)
		3. jquery + main.js — template behavior binds to the now-present #nav/#header

	Because this runs synchronously after the mount points are parsed but before
	the template's main.js, the real #header/#nav exist when Massively initializes.

	The only intentionally-duplicated chrome is a tiny <noscript> fallback nav in
	each page's HTML (JS-disabled visitors), since <noscript> cannot be injected.
*/
(function () {
	var cfg = window.LOOM || {};
	var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();

	function mount(name, html) {
		var el = document.querySelector('[data-loom="' + name + '"]');
		if (el) { el.outerHTML = html; }
	}

	function navLinks() {
		return (cfg.nav || []).map(function (item) {
			var active = item.href.toLowerCase() === page ? ' class="active"' : "";
			return '<li' + active + '><a href="' + item.href + '">' + item.label + "</a></li>";
		}).join("");
	}

	var header =
		'<header id="header">' +
			'<a href="index.html" class="logo">' +
				'<img class="logo-mark" src="' + cfg.logo + '" alt="" />' + cfg.brand +
			"</a>" +
		"</header>";

	var nav =
		'<nav id="nav">' +
			'<ul class="links">' + navLinks() + "</ul>" +
			'<ul class="icons">' +
				'<li><a href="' + cfg.githubUrl + '" class="icon brands fa-github">' +
					'<span class="label">GitHub</span></a></li>' +
			"</ul>" +
		"</nav>";

	var footer =
		'<footer id="footer">' +
			"<section>" +
				'<form method="post" action="#">' +
					'<div class="fields">' +
						'<div class="field"><label for="name">Name</label>' +
							'<input type="text" name="name" id="name" /></div>' +
						'<div class="field"><label for="email">Email</label>' +
							'<input type="text" name="email" id="email" /></div>' +
						'<div class="field"><label for="message">Message</label>' +
							'<textarea name="message" id="message" rows="3"></textarea></div>' +
					"</div>" +
					'<ul class="actions"><li><input type="submit" value="Send Message" /></li></ul>' +
				"</form>" +
			"</section>" +
			'<section class="split contact">' +
				'<section class="alt"><h3>Lab</h3><p>' +
					(cfg.lab || []).join("<br />") + "</p></section>" +
				"<section><h3>Project</h3><p>" + cfg.project + "</p></section>" +
				'<section><h3>Contact</h3><p><a href="#">' + cfg.contactEmail + "</a></p></section>" +
				'<section><h3>Code</h3><ul class="icons alt"><li>' +
					'<a href="' + cfg.githubUrl + '" class="icon brands alt fa-github">' +
					'<span class="label">GitHub</span></a></li></ul></section>' +
			"</section>" +
		"</footer>";

	var copyright =
		'<div id="copyright"><ul>' +
			"<li>&copy; " + cfg.brand + "</li>" +
			'<li>Design: <a href="https://html5up.net">HTML5 UP</a></li>' +
		"</ul></div>";

	mount("header", header);
	mount("nav", nav);
	mount("footer", footer);
	mount("copyright", copyright);
})();
