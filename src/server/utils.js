export function registerWebpackReferences(modules) {
  const __webpack_modules__ = Object.assign(
    globalThis.__webpack_require__?.m ?? {},
    modules
  );
  globalThis.__webpack_require__ = (id) => globalThis.__webpack_require__.m[id];
  __webpack_require__.m = __webpack_modules__;
}
