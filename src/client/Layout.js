import { createContext, useContext, use } from "react";
import { jsxs, jsx } from "react/jsx-runtime";

export const PageContext = createContext(null);

export function PageContent() {
  const dataPromise = useContext(PageContext);
  const data = use(dataPromise);
  return data.page;
}

export function Layout() {
  return jsxs("html", {
    children: [
      jsxs("head", {
        children: [
          jsx("meta", {
            charSet: "UTF-8",
          }),
          jsx("title", {
            children: "React Server Raw",
          }),
          jsx("link", {
            rel: "icon",
            href: "/favicon.ico",
          }),
        ],
      }),
      jsxs("body", {
        children: [
          jsx("h3", {
            children: "React Server Raw",
          }),
          jsxs("div", {
            children: [
              jsx("a", {
                href: "/",
                children: "Home",
              }),
              " | ",
              jsx("a", {
                href: "/other",
                children: "Other",
              }),
            ],
          }),
          jsx(PageContent, {}),
        ],
      }),
    ],
  });
}
