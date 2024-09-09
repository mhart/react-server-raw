import { jsx } from "react/jsx-runtime";
import { renderToReadableStream, resume } from "react-dom/server";
import { createFromReadableStream } from "react-server-dom-webpack/client";
import { prerender } from "react-dom/static";

import { renderRsc, SERVER_REFERENCES } from "./rsc/index.js";
import { registerWebpackReferences } from "./utils.js";

import { Layout, PageContext, PageContent } from "../client/Layout.js";
import { Counter as CounterUseState } from "../client/CounterUseState.js";
import { Counter as CounterServerAction } from "../client/CounterServerAction.js";

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

// These prerendered json configs can be generated by operating with RENDER_MODE = "prerender"
// They contain both the generated HTML as well as "postpone" data needed for resuming renders
// In a production scenario, you'd stream the HTML straight from a CDN, before following with
// the dynamically rendered data
const PRERENDER_ROUTES = {
  "/": () => import("./prerender/index.json"),
  "/other": () => import("./prerender/other.json"),
};

// This inserts our own RSC instructions into the HTML page, which can be read by the
// browser while they're streaming
function injectStreamScript(stream, scriptName) {
  // const search = "</body>";
  const search = `src="${scriptName}" async=""></script>`;
  let isFound = false;
  let buffer = "";
  const cutEarly = true;
  // const cutEarly = false;
  return new TransformStream({
    async transform(chunk, controller) {
      if (isFound) {
        return cutEarly ? undefined : controller.enqueue(chunk);
      }
      buffer += chunk;

      const matchIndex = buffer.indexOf(search);
      if (matchIndex < 0) {
        controller.enqueue(buffer.slice(0, -search.length));
        buffer = buffer.slice(-search.length);
        return;
      }

      isFound = true;

      const beforeMatch = buffer.slice(0, matchIndex + search.length);
      const afterMatch = buffer.slice(matchIndex + search.length);
      buffer = "";

      controller.enqueue(beforeMatch);
      controller.enqueue(`<script>self.__stream_chunks||=[]</script>\n`);

      await stream.pipeThrough(new TextDecoderStream()).pipeTo(
        new WritableStream({
          write(chunk2) {
            controller.enqueue(
              `<script>__stream_chunks.push(${JSON.stringify(
                chunk2
              )})</script>\n`
            );
          },
        })
      );

      if (cutEarly) {
        controller.enqueue("</body></html>");
      } else {
        controller.enqueue(afterMatch);
      }
    },
    flush(controller) {
      if (buffer.length) {
        controller.enqueue(buffer);
      }
    },
  });
}

// `createFromReadableStream` below expects us to pass in a map
// that can take an id and a name and return a webpack config
// for that module. We setup the webpack globals to return modules exactly based on id and name,
// so can just return a config with exactly what's passed in
const SSR_MODULE_MAP = new Proxy(
  {},
  {
    get(_target, id, _receiver) {
      return new Proxy(
        {},
        {
          get(_target2, name, _receiver2) {
            return {
              id,
              name,
              chunks: [],
            };
          },
        }
      );
    },
  }
);

// Render html from rsc
async function renderHtml(
  request,
  { stream: rscPageDataStream, actionResult }
) {
  const [stream1, stream2] = rscPageDataStream.tee();

  const pageDataPromise = createFromReadableStream(stream1, {
    ssrManifest: {
      moduleMap: SSR_MODULE_MAP,
      moduleLoading: null,
    },
  });

  const url = new URL(request.url);

  const reactRootEl = jsx(PageContext.Provider, {
    value: pageDataPromise,
    children: jsx(Layout, {}),
  });

  const bootstrapScriptContent =
    "__webpack_require__ = function(id) { throw new Error(`module '${id}' not found`) }";
  const bootstrapModules = ["/bootstrap.js"];

  if (globalThis.RENDER_MODE === "prerender") {
    const { prelude, postponed } = await prerender(reactRootEl, {
      bootstrapScriptContent,
      bootstrapModules: url.search.includes("__nojs") ? [] : bootstrapModules,
    });
    return Response.json({
      postponed,
      prelude: await new Response(prelude).text(),
    });
  }

  let ssrStream;
  let status = 200;

  if (globalThis.RENDER_MODE === "resume") {
    const { postponed, prelude } = await (
      PRERENDER_ROUTES[url.pathname] ?? PRERENDER_ROUTES["/"]
    )();
    ssrStream = (
      await resume(
        reactRootEl,
        postponed
          ? JSON.parse(JSON.stringify(postponed))
          : { resumableState: {}, replayNodes: [] }
      )
    ).pipeThrough(
      new TransformStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(prelude + "\n"));
        },
        transform(chunk, controller) {
          controller.enqueue(chunk);
        },
      })
    );
  } else {
    // Normal SSR render
    ssrStream = await renderToReadableStream(reactRootEl, {
      formState: actionResult?.data,
      bootstrapScriptContent,
      bootstrapModules: url.search.includes("__nojs") ? [] : bootstrapModules,
    });
  }

  ssrStream = ssrStream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(injectStreamScript(stream2, bootstrapModules.at(-1)))
    .pipeThrough(new TextEncoderStream());

  return new Response(ssrStream, {
    status,
    headers: {
      ...actionResult?.responseHeaders,
      "content-type": "text/html",
    },
  });
}

async function handler(request) {
  registerWebpackReferences(CLIENT_REFERENCES);
  registerWebpackReferences(SERVER_REFERENCES);

  /* Returns Response | { stream, actionResult } */
  const renderedRsc = await renderRsc({ request });
  if (renderedRsc instanceof Response) {
    return renderedRsc;
  }
  return renderHtml(request, renderedRsc);
}

// Custom behaviour for Cloudflare local dev
export default {
  async fetch(request, env) {
    globalThis.RENDER_MODE = env.RENDER_MODE ?? "ssr";
    let response = await handler(request);
    response = new Response(response.body, response);
    response.headers.set("content-encoding", "identity");
    return response;
  },
};