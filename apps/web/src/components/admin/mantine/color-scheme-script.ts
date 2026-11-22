/**
 * Inline script for the admin layout: applies the saved Light / Dark / Auto choice before the page
 * paints, to both Mantine (data-mantine-color-scheme) and the Tailwind components (.dark), so
 * there is no flash. Same storage key as Mantine's color scheme manager.
 */
export const COLOR_SCHEME_KEY = "mantine-color-scheme-value";

export const colorSchemeScript = `try {
  var v = localStorage.getItem("${COLOR_SCHEME_KEY}");
  var s = v === "dark" || v === "light" ? v : v === "auto" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  var d = document.documentElement;
  d.setAttribute("data-mantine-color-scheme", s);
  d.classList.toggle("dark", s === "dark");
} catch (e) {}`;
