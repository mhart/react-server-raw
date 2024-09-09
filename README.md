# react-server-raw

An exploration under the hood of how some React 19 concepts work: single-server SSR+RSC, Server Actions, `use client`, `use server`, and pre-rendering – without needing a framework.

This thing is so unbundled and raw it's blue. It's just JS – it doesn't even use .jsx files 😱

(I thought this would help unobscure some of the concepts – but tbh I'm not sure it helps that much – I may change to use .jsx at some point)

Another way to look at it is: "here's what a framework+bundler might have produced as output, but in a way that's hopefully easy to understand".

## Getting Started

```console
npm install
npm run build
npm run preview
```

Then press 'b' or browse to http://localhost:8787 and marvel at the rawness.

This uses Cloudflare's `workerd` to preview – but there's nothing particularly Cloudflare-specific about this solution – it should work on Node.js or any other server runtime as well with little modification.

Deployed live at: https://react-server-raw.michael.workers.dev/

## Overview

This project demonstrates the following features:

1. A single server/worker handling both SSR and RSC streaming rendering (aka Fizz and Flight in React parlance) of a Layout with swappable Page content
2. Pre-rendered HTML shells with dynamic resuming (aka "PPR")
3. [Server Actions](https://react.dev/reference/rsc/server-actions) and server references (aka the things some frameworks generate with [`use server`](https://react.dev/reference/rsc/use-server) directives)
4. Client references (aka the things some frameworks generate with [`use client`](https://react.dev/reference/rsc/use-client) directives)

## SSR and RSC together

SSR streaming has been around in React for a while – it allows you to render initial HTML and have dynamic content stream as needed, updating the DOM as new script snippets come in. RSC/Flight is a new format that represents React components in a more concise way, and it can also be streamed and update elements as it goes.

However, combining the two is a little difficult, not least because of the way that React has decided to support npm packages for RSC – _one of the biggest mistakes I think they've made_. Essentially, instead of providing separate packages for SSR and RSC rendering, they (ab)use [Node.js conditional exports](https://nodejs.org/api/packages.html#conditional-exports).

To use RSC rendering, you have to have the `react-server` condition set in your Node.js process or build tool. This will change what file is actually imported when your code imports `react`, `react-dom`, etc. Which means you can't have both! You can't import normal `react` for SSR and import `react` for RSC in the same process. You're stuck with either running separate processes for SSR and RSC rendering, or using a bundler that can compile your code in layers with different conditions.

This really isn't what Node.js conditional exports should be used for IMO. They're intended for situations where you want to have code that produces the same output on different platforms. Eg, being able to use the same package for the browser and for Node.js. Users expect them to produce the same output (platform constraints aside). They wouldn't expect the same package to produce output in a completely different format. Especially not when there are good reasons to use the same formats side by side.

Not only this, it's also terrible for trying to navigate code in a codebase when trying to debug issues, because you have to figure out which path a particular import statement might have made, depending on what condition might have been set at the time.

`</rant>`

In any case, the approach taken in this repo is to have a build step that compiles one collection of files with the `react-server` condition (everything under `src/rsc`), and then copies those compiled files and everything else into a `build` directory.

React also doesn't have an official way to manage RSC, Server Actions, client/server references, etc without using one of their packages intended for bundler environments (yet? `react-server-dom-esm` is still unpublished). In this repo we use `react-server-dom-webpack` for this, and just define any webpack-related globals needed to resolve references, even though we're not using webpack itself.

## Rendering and streaming

This app consists of a Layout component, with a nested Page component that can be swapped (eg, depending on route) via a PageContext.

When being sent to the browser, the server-rendered (or prerendered) HTML is sent first, and then any RSC rendering is sent as chunks of strings that are interpreted in the browser.

ie, the HTML stream has the following inserted just before the end of the body (see `injectStreamScript` in `src/index.js`):

```html
<script>
  __stream_chunks.push("0:{...rscChunk1}");
</script>
<!-- later -->
<script>
  __stream_chunks.push("1:{...rscChunk2}");
</script>
```

And then the browser can read these RSC chunks as soon as they arrive and turn them into DOM elements (using `createFromReadableStream` from `react-server-dom-webpack/client`).

You can view RSC responses directly by adding the `__rsc` search param, eg `localhost:8787/?__rsc=1`

## Prerendering

In this repo, the global variable `RENDER_MODE` determines whether the server will use "normal" server-side rendering (ie, rendering the whole page), or resuming a partial pre-render (ie, sending a prerendered HTML shell, with dynamic content streamed after).

You can try PPR by changing this variable in `wrangler.toml`:

```toml
RENDER_MODE = "resume"
```

This will use the prerendered config files found in `src/server/prerender` for the HTML and "postpone" data needed for resume rendering.

To regenerate these prerendered files, you can change `RENDER_MODE`:

```toml
RENDER_MODE = "prerender"
```

And then add the contents to the prerendered files.

```console
curl localhost:8787 > src/server/prerender/index.json
curl localhost:8787/other > src/server/prerender/other.json
```

(the files are actually served from the `build` directory – so you might want to run a build or copy them over manually after regenerating)

To go back to normal SSR rendering, use:

```toml
RENDER_MODE = "ssr"
```

(or anything else – it's the default)

## `use client` and `use server`

The React docs are a little confusing in this regard – actually there's no code in the React codebase that parses or understands these directives at all!

What React _does_ understand is client references and server references as created by `registerClientReference`, `createServerReference`, and `registerServerReference` – these calls are what your framework+bundler (eg webpack) are expected to create from these directives.

Eg, if you had a file:

```js
"use client";

export function Counter({ value }) {
  // ...
}
```

Then what your framework+bundler is expected to do, is to compile this into separate instructions for the client and server.

Eg, on the server, it turns into a component that is essentially just a string reference. Something like:

```js
import { registerClientReference } from "react-server-dom-webpack/server";

export const Counter = registerClientReference(
  () => {},
  "client/counter",
  "Counter"
);
```

And then on the client it essentially stays the same as the original code, but gets registered in a way that can be looked up whenever server-rendered RSC sends through that same id/reference.

```js
function Counter({ value }) {
  // ...
}

const CLIENT_REFERENCES = {
  "client/counter": {
    Counter,
  },
  // ...
};

globalThis.__webpack_require__ = (id) => CLIENT_REFERENCES[id];
```

As we're using `react-server-dom-webpack` here, it will use standard webpack globals to try and resolve these modules – so we just define our own implementation.

And then for server references, let's you have a file that looks like this:

```js
"use server";

let counter = 0;

export async function getCounter() {
  return counter;
}
```

Then it's expected to compile into something like this for your client/browser:

```js
import { createServerReference } from "react-server-dom-webpack/client";

export const getCounter = createServerReference(
  "server/counter-actions#getCounter"
);
```

ie, it just becomes a string reference (which is used to construct forms for server action handling, etc)

And in your server code, compile to something like:

```js
import { registerServerReference } from "react-server-dom-webpack/server";

let counter = 0;

export const getCounter = registerServerReference(
  async function () {
    return counter;
  },
  "server/counter-actions",
  "getCounter"
);
```

ie, it's just the original code wrapped with the same id/references so that the server now knows what function to execute when that string reference is sent to it via a server action from the client.

In summary, `use client` and `use server` don't mean anything to React – they're just arbitrary markers used by frameworks to parse into actual create/register reference calls (the reference id strings are also arbitrary – they typically match the name of the file/module/function/component, but so long as they're the same in client and server code, it doesn't matter)

## Server Action handling

TODO

## Thanks

Huge shoutout to [@hi-ogawa's vite-plugins](https://github.com/hi-ogawa/vite-plugins) for giving me an example to play with that I could understand the concepts from.
