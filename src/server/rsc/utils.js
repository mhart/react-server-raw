import { registerClientReference } from "react-server-dom-webpack/server";

export function registerClientReferenceSimple(module, name) {
  const safeName = JSON.stringify(name);
  return registerClientReference(
    function () {
      throw new Error(
        `Attempted to call ${safeName}() from the server but ${safeName} is on the client. ` +
          `It's not possible to invoke a client function from the server, it can ` +
          `only be rendered as a Component or passed to props of a Client Component.`
      );
    },
    module,
    name
  );
}
