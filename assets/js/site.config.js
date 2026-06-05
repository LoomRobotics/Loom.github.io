/*
	Loom Robotics — site configuration (SINGLE SOURCE OF TRUTH)

	Edit brand strings, navigation, and footer details HERE. Every page renders
	its header / nav / footer / copyright from this object via assets/js/site.js
	(no build step). Rename a nav label, change the GitHub URL, or update the
	contact email in one place and it updates across the whole site.

	To add a page to the nav: add an entry to `nav` below. The active item is
	highlighted automatically based on the current filename.
*/
window.LOOM = {
	brand: "Loom Robotics",
	project: "LEGOSwarm",
	tagline: "Decentralized robotic construction systems",
	githubUrl: "https://github.com/LoomRobotics/LEGOSwarm",
	contactEmail: "hello@loomrobotics.com",
	logo: "images/transp-white.png",

	// Primary navigation — order here is the order shown on every page.
	nav: [
		{ label: "Loom Robotics",      href: "index.html" },
		{ label: "About",              href: "about.html" },
		{ label: "Technical Overview", href: "technical.html" },
		{ label: "Dev Log",            href: "devlog.html" },
		{ label: "Media",              href: "gallery.html" },
		{ label: "Architecture",       href: "architecture.html" }
	],

	// Footer "Lab" column copy (one <p> line per array entry).
	lab: [
		"Loom Robotics — Research Platform",
		"Decentralized robotic construction systems"
	]
};
