import { useState, StrictMode } from "react";
import { jsx } from "react/jsx-runtime";
import { createRoot, hydrateRoot } from "react-dom/client";
import {
  encodeReply,
  createFromFetch,
  createFromReadableStream,
} from "react-server-dom-webpack/client";

import { actionHandler } from "./actions.js";

import { Layout, PageContext, PageContent } from "./Layout.js";
import { Counter as CounterUseState } from "./CounterUseState.js";
import { Counter as CounterServerAction } from "./CounterServerAction.js";

// Normally a bundler (eg webpack) would register these IDs and modules,
// based on each component having a `use client` directive at the top
const CLIENT_REFERENCES = {
  "client/layout": {
    PageContent,
  },
  "client/counter-server-action": {
    Counter: CounterServerAction,
  },
  "client/counter-use-state": {
    Counter: CounterUseState,
  },
};

// Turn the RSC chunk arrays into a stream
function readStreamScript(onPush) {
  let onPushCalled = false;
  return new ReadableStream({
    start(controller) {
      const chunks = (globalThis.__stream_chunks ||= []);
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      chunks.push = function (chunk) {
        if (!onPushCalled) {
          onPush?.();
          onPushCalled = true;
        }
        controller.enqueue(chunk);
        return 0;
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          controller.close();
        });
      } else {
        controller.close();
      }
    },
  }).pipeThrough(new TextEncoderStream());
}

async function start() {
  let globalSetPageDataPromise;

  const callServer = async (id, args) => {
    const url = new URL(location.href);
    url.searchParams.set(
      "__rsc",
      JSON.stringify({
        lastPathname: location.pathname, // optional to track this
      })
    );
    const request = new Request(url, {
      method: "POST",
      body: await encodeReply(args),
      headers: { "x-server-action-id": id },
    });
    const result = createFromFetch(fetch(request), { callServer });

    // Whether to freeze the whole page while fetching
    // startTransition(() => globalSetPageDataPromise(result));
    globalSetPageDataPromise(result);

    return (await result).action?.data;
  };

  actionHandler.callServer = callServer;

  globalThis.__webpack_require__ = (id) => CLIENT_REFERENCES[id];

  const initialPageDataPromise = Promise.resolve(
    await createFromReadableStream(
      readStreamScript(async () => {
        globalSetPageDataPromise(Promise.resolve(await initialPageDataPromise));
      }),
      {
        callServer,
      }
    )
  );

  function LayoutHandler({ children }) {
    const [pageDataPromise, setPageDataPromise] = useState(
      initialPageDataPromise
    );
    globalSetPageDataPromise = setPageDataPromise;
    return jsx(PageContext.Provider, {
      value: pageDataPromise,
      children,
    });
  }

  const reactRootEl = jsx(StrictMode, {
    children: jsx(LayoutHandler, {
      children: jsx(Layout, {}),
    }),
  });

  if (document.documentElement.dataset["noHydrate"]) {
    // if data-no-hydrate is set on the html element
    createRoot(document).render(reactRootEl);
  } else {
    hydrateRoot(document, reactRootEl, {
      // formState: initialPageData.action?.data,
    });
  }
}

start();
