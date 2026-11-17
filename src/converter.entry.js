// Entry point for the static (no-server) player page.
//
// Bundled with esbuild into web/converter.js as a classic script, so index.html
// can be opened straight from disk (module scripts are blocked on file://).
import { convertXmlSet } from "./js/convert.js";
import { convertFeedpak, convertFeedpakFiles } from "./js/feedpak.js";
import { decodeDds } from "./js/cover.js";
import { clearXmlCache, xmlStats } from "./js/xml.js";

window.CDLC = { convertFeedpakFiles, convertXmlSet, convertFeedpak, decodeDds, clearXmlCache, xmlStats };
