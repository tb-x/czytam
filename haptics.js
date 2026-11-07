/* ==========================================================
   Wibracje przy wydarzeniach w grze.

   Android (Chrome, Firefox, …): navigator.vibrate — pełne wzory.
   iPhone / iPad (Safari, iOS 18+): Safari nie ma navigator.vibrate,
     ale kliknięcie w natywny przełącznik <input type="checkbox" switch>
     daje systemowe „stuknięcie”. Z kilku stuknięć układamy wzór.
     iOS gra je pewnie tylko w odpowiedzi na dotknięcie ekranu,
     więc zdarzenia „same z siebie” (odliczanie, wybuch) mogą być ciche.
   Reszta (komputery, starsze iOS): po cichu nic nie robi.

   Haptics.buzz("ok") — nazwy wzorów w PATTERNS poniżej.
   ========================================================== */
(function () {
  "use strict";

  // [drganie ms, przerwa ms, drganie ms, ...]
  var PATTERNS = {
    key:     [8],                              // stuknięcie klawisza
    ok:      [20],                             // dobra odpowiedź
    land:    [35],                             // część rakiety wylądowała
    bad:     [70, 60, 70],                     // pomyłka
    hurry:   [15, 90, 15],                     // czas się kończy (pasek czerwony)
    tick:    [40],                             // 3… 2… 1…
    ignite:  [300, 60, 500, 60, 900],          // start silników
    sputter: [80, 60, 80, 60, 120, 80, 200],   // silnik się krztusi
    boom:    [500, 100, 250, 100, 120],        // wybuch
    win:     [50, 70, 50, 70, 180]             // brawo!
  };

  // Chrome na komputerze też ma navigator.vibrate (nic nie robi), więc liczymy tylko ekrany dotykowe
  var touch = navigator.maxTouchPoints > 0;
  var canVibrate = touch && typeof navigator.vibrate === "function";
  var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
              (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var useSwitch = !canVibrate && isIOS;

  function load() {
    try { return localStorage.getItem("czytam.vibrate") !== "0"; } catch (e) { return true; }
  }
  var enabled = load();

  // jedno systemowe stuknięcie na iOS
  function iosTap() {
    try {
      var label = document.createElement("label");
      label.setAttribute("aria-hidden", "true");
      label.style.display = "none";
      var input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      label.appendChild(input);
      document.head.appendChild(label);
      label.click();
      document.head.removeChild(label);
    } catch (e) {}
  }

  function buzz(name) {
    var p = PATTERNS[name];
    if (!enabled || !p) return;
    if (canVibrate) {
      try { navigator.vibrate(p); } catch (e) {}
    } else if (useSwitch) {
      // każde drganie ze wzoru = jedno stuknięcie, najwyżej 4
      var taps = Math.min(4, Math.ceil(p.length / 2));
      iosTap();
      for (var i = 1; i < taps; i++) setTimeout(iosTap, i * 110);
    }
  }

  window.Haptics = {
    supported: canVibrate || useSwitch,
    buzz: buzz,
    isOn: function () { return enabled; },
    setOn: function (on) {
      enabled = !!on;
      try { localStorage.setItem("czytam.vibrate", enabled ? "1" : "0"); } catch (e) {}
      if (!enabled && canVibrate) { try { navigator.vibrate(0); } catch (e) {} }
    }
  };
})();
