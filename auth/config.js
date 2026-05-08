(function () {
  "use strict";

  var existing = window.MIDORI_AUTH_CONFIG || {};
  var detected = detectMidoriBase();

  window.MIDORI_AUTH_CONFIG = Object.assign(
    {
      GAS_ENDPOINT: "https://script.google.com/macros/s/AKfycbxvbUJ_6Jjv-u5jNlv-QDXZNA-N4vH2ZvmAwNHgeEj5fCNIziMEv3FrrraYCBfwcbXJ/exec",
      PUBLIC_BASE_URL: detected.publicBaseUrl,
      AUTH_BASE_PATH: detected.authBasePath,
      STORAGE_PREFIX: "midori.auth.",
      PASSWORD_HASH_ITERATIONS: 100000,
      ONE_TIME_TICKET_PARAM: "ticket",
      RETURN_TO_PARAM: "returnTo",
      DEFAULT_DEVICE_NAME: "browser",
    },
    existing
  );

  function detectMidoriBase() {
    var path = window.location.pathname || "/";
    var marker = "/auth/";
    var markerIndex = path.indexOf(marker);
    var basePath = "/midori2026";

    if (markerIndex >= 0) {
      basePath = path.slice(0, markerIndex) || "";
    } else if (path.slice(-5) === "/auth") {
      basePath = path.slice(0, -5) || "";
    }

    if (basePath === "/") {
      basePath = "";
    }

    return {
      publicBaseUrl: window.location.origin + basePath,
      authBasePath: (basePath || "") + "/auth/",
    };
  }
})();
