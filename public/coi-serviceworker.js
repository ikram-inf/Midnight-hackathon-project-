// coi-serviceworker.js
//
// GitHub Pages can't set custom HTTP response headers, but WebLLM needs
// Cross-Origin-Embedder-Policy / Cross-Origin-Opener-Policy to enable
// crossOriginIsolated (required for SharedArrayBuffer / WASM threads).
//
// This service worker intercepts every response and adds those headers
// itself, then reloads the page once so the browser picks up isolation.
// Not needed on Vercel (see vercel.json) — only required for static hosts
// that don't let you configure headers, like GitHub Pages.

if (typeof window === "undefined") {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener("fetch", function (event) {
    if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
      return;
    }
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 0) return response;
          const newHeaders = new Headers(response.headers);
          newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
          newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => console.error(e))
    );
  });
} else {
  (() => {
    if (window.crossOriginIsolated) return;

    navigator.serviceWorker.register(window.document.currentScript.src).then(
      (registration) => {
        registration.addEventListener("updatefound", () => {
          window.location.reload();
        });
        if (registration.active && !navigator.serviceWorker.controller) {
          window.location.reload();
        }
      },
      (err) => console.error("COOP/COEP service worker failed to register:", err)
    );
  })();
}
