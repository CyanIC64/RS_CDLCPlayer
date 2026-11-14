// Entry point for the static (no-server) player page.
//
// Bundled with esbuild into web/converter.js as a classic script, so index.html
// can be opened straight from disk (module scripts are blocked on file://).
import { convertPsarc } from "../static_web_feasibility/js/convert.js";
import { convertFeedpak } from "../static_web_feasibility/js/feedpak.js";
import { decodeDds } from "../static_web_feasibility/js/cover.js";
import { clearXmlCache, xmlStats } from "../static_web_feasibility/js/xml.js";

window.CDLC = { convertPsarc, convertFeedpak, decodeDds, clearXmlCache, xmlStats };
