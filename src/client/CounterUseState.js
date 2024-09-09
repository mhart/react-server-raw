import { useState, lazy, Suspense } from "react";
import { jsxs, jsx } from "react/jsx-runtime";

const LazyLoader = lazy(async () => {
  await new Promise((r) => setTimeout(r, 1000));
  return {
    default: () => "Loaded UseState Header!",
  };
});

export function Counter() {
  const [value, setValue] = useState(0);
  return jsxs("div", {
    children: [
      jsx("div", {
        children: jsx(Suspense, {
          fallback: "Loading UseState Header...",
          children: jsx(LazyLoader, {}),
        }),
      }),
      jsxs("span", { children: ["Use State Count: ", value] }),
      jsxs("div", {
        children: [
          jsx("button", {
            onClick: () => setValue((v) => v - 1),
            children: "-1",
          }),
          jsx("button", {
            onClick: () => setValue((v) => v + 1),
            children: "+1",
          }),
        ],
      }),
    ],
  });
}
