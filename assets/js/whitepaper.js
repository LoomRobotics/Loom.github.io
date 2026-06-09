/*
	Loom Robotics — white paper page (technical.html)

	Scroll-spy for the sticky table of contents: highlights the TOC entry for the
	section currently at the top of the read, plus its ancestor entries so the
	path (e.g. "1 · Introduction" › "1.1 · Motivation") stays lit. Vanilla JS, no
	jQuery. Any TOC link whose href points at an element on the page is picked up
	automatically, so adding sections needs no edits here.
*/
(function () {
	"use strict";

	var toc = document.querySelector(".paper-toc");
	if (!toc) return;

	// Ordered (document order) list of {link, target} pairs the TOC points at.
	var items = [];
	toc.querySelectorAll('a[href^="#"]').forEach(function (a) {
		var el = document.getElementById(a.getAttribute("href").slice(1));
		if (el) items.push({ a: a, el: el });
	});
	if (!items.length) return;

	var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	// Trigger line a little below the viewport top; a section becomes current
	// once its heading scrolls above this line.
	var TRIGGER = 140;

	function setActive(link) {
		toc.querySelectorAll("a.active").forEach(function (a) {
			a.classList.remove("active");
		});
		link.classList.add("active");
		// Light ancestor TOC links (parent <li> > a) so the trail shows.
		var li = link.closest("li");
		while (li) {
			var parentLi = li.parentElement && li.parentElement.closest("li");
			if (!parentLi) break;
			var pa = parentLi.querySelector(":scope > a");
			if (pa) pa.classList.add("active");
			li = parentLi;
		}
	}

	function update() {
		// The current section = the last target whose top has crossed the line.
		var current = items[0].a;
		for (var i = 0; i < items.length; i++) {
			if (items[i].el.getBoundingClientRect().top - TRIGGER <= 0) {
				current = items[i].a;
			}
		}
		setActive(current);
	}

	// Smooth-scroll TOC clicks (CSS scroll-margin-top keeps the heading clear).
	items.forEach(function (item) {
		item.a.addEventListener("click", function (e) {
			e.preventDefault();
			item.el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
			if (history.replaceState) history.replaceState(null, "", "#" + item.el.id);
		});
	});

	var ticking = false;
	function onScroll() {
		if (ticking) return;
		ticking = true;
		requestAnimationFrame(function () { update(); ticking = false; });
	}

	window.addEventListener("scroll", onScroll, { passive: true });
	window.addEventListener("resize", onScroll);
	update();
})();
