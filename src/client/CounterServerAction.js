import { jsxs, jsx } from "react/jsx-runtime";

import { getCounter, changeCounter } from "./actions.js";

export function Counter({ value }) {
  return jsxs("div", {
    children: [
      jsxs("form", {
        action: changeCounter,
        children: [
          jsxs("div", { children: ["Server Action Count: ", value] }),
          jsxs("div", {
            children: [
              jsx("button", {
                name: "delta",
                value: -1,
                children: "-1",
              }),
              jsx("button", {
                name: "delta",
                value: 1,
                children: "+1",
              }),
            ],
          }),
        ],
      }),
      jsx("button", {
        onClick: async () => console.log(await getCounter()),
        children: "Console Log Counter",
      }),
    ],
  });
}
