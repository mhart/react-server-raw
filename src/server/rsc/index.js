import { jsx } from "react/jsx-runtime";

import {
  renderToReadableStream,
  registerServerReference,
  decodeReply,
  decodeAction,
  decodeFormState,
} from "react-server-dom-webpack/server";

import { getCounter, changeCounter } from "./actions.js";
import { HomePage } from "./HomePage.js";
import { OtherPage } from "./OtherPage.js";

export const SERVER_REFERENCES = {
  "server/counter-actions": {
    getCounter: registerServerReference(
      getCounter,
      "server/counter-actions",
      "getCounter"
    ),
    changeCounter: registerServerReference(
      changeCounter,
      "server/counter-actions",
      "changeCounter"
    ),
  },
};

const ROUTE_PAGES = {
  "/": HomePage,
  "/other": OtherPage,
};

const BUNDLER_CONFIG = new Proxy(
  {},
  {
    get(_target, $$id, _receiver) {
      let [id, name] = $$id.split("#");
      return { id, name, chunks: [] };
    },
  }
);

const ACTION_BUNDLER_CONFIG = new Proxy(
  {},
  {
    get(_target, $$id, _receiver) {
      let [id, name] = $$id.split("#");
      return {
        id,
        name,
        chunks: [],
      };
    },
  }
);

async function actionHandler(request) {
  const context = {
    responseHeaders: {},
    revalidate: false,
    request,
  };

  const streamActionId = request.headers.get("x-server-action-id");

  let boundAction;

  if (streamActionId) {
    const contentType = request.headers.get("content-type");
    const body = contentType?.startsWith("multipart/form-data")
      ? await request.formData()
      : await request.text();
    const args = await decodeReply(body);

    const [ref, name] = streamActionId.split("#");
    const action = SERVER_REFERENCES[ref][name];

    boundAction = () => action.apply(null, args);
  } else {
    const formData = await request.formData();
    const decodedAction = await decodeAction(formData, ACTION_BUNDLER_CONFIG);
    boundAction = async () => {
      const result = await decodedAction();
      const formState = await decodeFormState(result, formData);
      return formState;
    };
  }

  const actionResult = { context };
  try {
    actionResult.data = await boundAction();
  } catch (e) {
    actionResult.error = { status: 500 };
  } finally {
    actionResult.responseHeaders = {
      ...context.responseHeaders,
      ...actionResult.error?.headers,
    };
  }
  return actionResult;
}

export async function renderRsc({ request }) {
  let actionResult;

  if (request.method === "POST") {
    actionResult = await actionHandler(request);
  }

  const { pathname, searchParams } = new URL(request.url);

  const pageComponent = ROUTE_PAGES[pathname] ?? ROUTE_PAGES["/"];

  const stream = await renderToReadableStream(
    // This object is passed to PageContext, used in Layout
    {
      page: jsx(pageComponent, {}),
      action: { data: actionResult?.data, error: actionResult?.error },
    },
    BUNDLER_CONFIG
  );

  if (
    searchParams.has("__rsc") ||
    request.headers.get("accept") === "text/x-component"
  ) {
    return new Response(stream, {
      headers: {
        ...actionResult?.responseHeaders,
        "content-type": "text/x-component; charset=utf-8",
      },
    });
  }

  return { stream, actionResult };
}
