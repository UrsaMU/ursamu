/**
 * Theme preview chrome — works with real site.js + fixture APIs.
 * Loaded only by preview-theme (not production games).
 */
(function () {
  "use strict";

  var TOKEN_KEY = "ursamu.webAdmin.token";
  var ROOT_ID = "tp-preview-bar";

  function pubBase() {
    var p = location.pathname || "/";
    if (
      p === "/" ||
      p.indexOf("/wiki") === 0 ||
      p.indexOf("/help") === 0 ||
      p.indexOf("/login") === 0 ||
      p.indexOf("/profile") === 0 ||
      p.indexOf("/play") === 0 ||
      p.indexOf("/chargen") === 0
    ) {
      return "";
    }
    return "/site";
  }

  function go(sub) {
    var b = pubBase();
    sub = String(sub || "").replace(/^\/+/, "");
    var url = sub ? (b ? b + "/" + sub : "/" + sub) : (b ? b + "/" : "/");
    location.href = url;
  }

  function setToken(kind) {
    try {
      if (!kind || kind === "guest") {
        sessionStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_KEY);
      } else {
        var t = kind === "staff" ? "preview-staff" : "preview-player";
        sessionStorage.setItem(TOKEN_KEY, t);
        localStorage.setItem(TOKEN_KEY, t);
      }
    } catch (_) { /* private mode */ }
    location.reload();
  }

  function currentAuth() {
    try {
      var t = sessionStorage.getItem(TOKEN_KEY) ||
        localStorage.getItem(TOKEN_KEY) || "";
      if (t.indexOf("staff") !== -1) return "staff";
      if (t) return "player";
    } catch (_) { /* ignore */ }
    return "guest";
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function btn(label, title, fn) {
    var b = el("button", "tp-bar__btn", label);
    b.type = "button";
    if (title) b.title = title;
    b.addEventListener("click", fn);
    return b;
  }

  function mount() {
    if (document.getElementById(ROOT_ID)) return;
    var bar = el("div", "tp-bar");
    bar.id = ROOT_ID;
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Theme preview controls");

    bar.appendChild(el("span", "tp-bar__brand", "Theme preview"));

    var routes = el("div", "tp-bar__group");
    routes.appendChild(btn("Home", "Hero + home wiki", function () {
      go("");
    }));
    routes.appendChild(btn("Wiki", "Wiki index listing", function () {
      go("wiki/");
    }));
    routes.appendChild(btn("Article", "Featured wiki page", function () {
      go("wiki/lore/city");
    }));
    routes.appendChild(btn("Help", "Help browser", function () {
      go("help/");
    }));
    routes.appendChild(btn("Topic", "Help topic +look", function () {
      go("help/look");
    }));
    routes.appendChild(btn("Play", "Play client (demo feed)", function () {
      if (currentAuth() === "guest") {
        try {
          sessionStorage.setItem(TOKEN_KEY, "preview-player");
          localStorage.setItem(TOKEN_KEY, "preview-player");
        } catch (_) { /* private mode */ }
      }
      go("play");
    }));
    routes.appendChild(btn("Login", "Auth gate", function () {
      go("login");
    }));
    bar.appendChild(routes);

    var auth = el("div", "tp-bar__group");
    var who = currentAuth();
    auth.appendChild(el("span", "tp-bar__meta", "auth:" + who));
    auth.appendChild(btn("Guest", "Sign out (clear token)", function () {
      setToken("guest");
    }));
    auth.appendChild(btn("Player", "Mock logged-in player", function () {
      setToken("player");
    }));
    auth.appendChild(btn("Staff", "Mock staff account menu", function () {
      setToken("staff");
    }));
    bar.appendChild(auth);

    var tools = el("div", "tp-bar__group tp-bar__group--end");
    tools.appendChild(btn("Reload CSS", "Bust skin cache", function () {
      var link = document.querySelector("[data-site-skin]");
      if (!link) {
        location.reload();
        return;
      }
      var u = new URL(link.href, location.href);
      u.searchParams.set("t", String(Date.now()));
      link.href = u.pathname + u.search;
    }));
    tools.appendChild(btn("Narrow", "Toggle ~390px width hint", function () {
      document.documentElement.classList.toggle("tp-narrow");
    }));
    bar.appendChild(tools);

    document.body.appendChild(bar);
    document.documentElement.classList.add("tp-has-bar");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
