/*
	Lazy boot for the architecture explorer.

	cytoscape.min.js is 373 KB, and the white paper is a reading page: loading
	that up front to render a figure most visitors scroll past is the wrong
	trade. This waits until the explorer is nearly in view, then injects its
	three scripts in order (data, library, renderer). explorer.js runs on load
	and reads the DOM immediately, so order matters and the mount must already
	exist — both hold here.

	Safe to include on any page: it does nothing when there is no mount.
*/
(function () {
	"use strict";

	var mount = document.getElementById("arch-explorer");
	if (!mount || window.LoomExplorer) { return; }

	var SOURCES = [
		"assets/js/graph.data.js",
		"assets/js/vendor/cytoscape.min.js",
		"assets/js/explorer.js"
	];

	var started = false;
	function boot() {
		if (started) { return; }
		started = true;
		(function next(i) {
			if (i >= SOURCES.length) { return; }
			var s = document.createElement("script");
			s.src = SOURCES[i];
			s.async = false;
			s.onload = function () { next(i + 1); };
			s.onerror = function () {
				// Leave the noscript fallback's advice standing rather than a blank box.
				mount.innerHTML = '<p class="arch-boot-error">The interactive graph could not load.</p>';
			};
			document.body.appendChild(s);
		})(0);
	}

	if (!("IntersectionObserver" in window)) { boot(); return; }

	var io = new IntersectionObserver(function (entries) {
		if (!entries.some(function (e) { return e.isIntersecting; })) { return; }
		io.disconnect();
		boot();
	}, { rootMargin: "400px 0px" });
	io.observe(mount);
})();
