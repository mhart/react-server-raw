import { createServerReference } from "react-server-dom-webpack/client";

export const actionHandler = {
  callServer: () => {
    throw new Error("callServer not assigned correctly");
  },
};

export const getCounter = createServerReference(
  "server/counter-actions#getCounter",
  (...args) => actionHandler.callServer(...args)
);

export const changeCounter = createServerReference(
  "server/counter-actions#changeCounter",
  (...args) => actionHandler.callServer(...args)
);
