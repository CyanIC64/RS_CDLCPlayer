"use strict";
/* ── page helpers, shared by every script in app/ ─────────────────────────── */

/* an element of the page by its id */
const $ = (id) => document.getElementById(id);

/* the pill in the middle of the stage: what is being worked on right now */
function busy(text){
  $("msgTxt").textContent = text;
  $("msg").className = "";
}
function notice(text){ busy(text); $("msg").className = "plain"; }
function idle(){ $("msg").className = "hide"; }

/* What is kept in this browser (localStorage): the page has one address here,
   so the browser's own storage is the right place, and nothing about a
   visitor is stored on a server. Storage can be off or full (a private
   window): reads then give the fallback and writes do nothing. */
const Store = {
  PREFS: "playsong.prefs",              // the options (prefs.js)
  RIGS: "playsong.rigs",                // the player's pedalboards, per song and tone (rig.js)
  read(key, fallback){
    try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; } catch (e) { return fallback; }
  },
  write(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  },
};
