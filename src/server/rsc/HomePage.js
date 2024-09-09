import { Suspense, unstable_postpone } from "react";
import { jsx, jsxs, Fragment } from "react/jsx-runtime";

import { registerClientReferenceSimple } from "./utils.js";
import { getCounter } from "./actions.js";

const CounterUseState = registerClientReferenceSimple(
  "client/counter-use-state",
  "Counter"
);

const CounterServerAction = registerClientReferenceSimple(
  "client/counter-server-action",
  "Counter"
);

export async function HomePage() {
  return jsxs(Fragment, {
    children: [
      jsx(
        "div",
        {
          children: jsx(CounterUseState, {}),
        },
        1
      ),
      jsx(
        "div",
        {
          children: jsx(Suspense, {
            fallback: jsx(CounterServerAction, { value: "..." }),
            children: jsx(
              async () =>
                globalThis.RENDER_MODE === "prerender"
                  ? unstable_postpone()
                  : jsx(CounterServerAction, { value: await getCounter() }),
              {}
            ),
          }),
        },
        2
      ),
      jsx(
        "div",
        {
          children: jsx(Suspense, {
            fallback: "Loading 1...",
            children: jsx(Footer, {}),
          }),
        },
        3
      ),
      jsx(
        "div",
        {
          children: jsx(Suspense, {
            fallback: "Loading 2...",
            children: jsx(Footer2, {}),
          }),
        },
        4
      ),
    ],
  });
}

async function Footer() {
  globalThis.RENDER_MODE === "prerender" && unstable_postpone();
  await new Promise((r) => setTimeout(r, 1000));
  return jsx("div", { children: "Footer 1 Loaded\n" });
}

async function Footer2() {
  globalThis.RENDER_MODE === "prerender" && unstable_postpone();
  await new Promise((r) => setTimeout(r, 2000));
  return jsx("div", { children: "Footer 2 Loaded\n" });
}
