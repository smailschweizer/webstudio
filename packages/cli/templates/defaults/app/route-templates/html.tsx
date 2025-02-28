/* eslint-disable camelcase */
import {
  type ServerRuntimeMetaFunction as MetaFunction,
  type LinksFunction,
  type LinkDescriptor,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type HeadersFunction,
  json,
  redirect,
} from "@remix-run/server-runtime";
import { useLoaderData } from "@remix-run/react";
import { ReactSdkContext } from "@webstudio-is/react-sdk";
import {
  n8nHandler,
  formIdFieldName,
  formBotFieldName,
} from "@webstudio-is/form-handlers";
import {
  Page,
  siteName,
  favIconAsset,
  socialImageAsset,
  pageFontAssets,
  pageBackgroundImageAssets,
} from "__CLIENT__";
import {
  formsProperties,
  loadResources,
  getPageMeta,
  getRemixParams,
  projectId,
  contactEmail,
} from "__SERVER__";

import css from "__CSS__?url";
import { assetBaseUrl, imageBaseUrl, imageLoader } from "../constants.mjs";

export const loader = async (arg: LoaderFunctionArgs) => {
  const url = new URL(arg.request.url);
  const host =
    arg.request.headers.get("x-forwarded-host") ||
    arg.request.headers.get("host") ||
    "";
  url.host = host;
  url.protocol = "https";

  const params = getRemixParams(arg.params);
  const system = {
    params,
    search: Object.fromEntries(url.searchParams),
    origin: url.origin,
  };

  const resources = await loadResources({ system });
  const pageMeta = getPageMeta({ system, resources });

  if (pageMeta.redirect) {
    const status =
      pageMeta.status === 301 || pageMeta.status === 302
        ? pageMeta.status
        : 302;
    return redirect(pageMeta.redirect, status);
  }

  // typecheck
  arg.context.EXCLUDE_FROM_SEARCH satisfies boolean;

  return json(
    {
      host,
      url: url.href,
      excludeFromSearch: arg.context.EXCLUDE_FROM_SEARCH,
      system,
      resources,
      pageMeta,
    },
    // No way for current information to change, so add cache for 10 minutes
    // In case of CRM Data, this should be set to 0
    {
      status: pageMeta.status,
      headers: {
        "Cache-Control": "public, max-age=600",
      },
    }
  );
};

export const headers: HeadersFunction = ({ loaderHeaders }) => {
  return {
    "Cache-Control": "public, max-age=0, must-revalidate",
  };
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const metas: ReturnType<MetaFunction> = [];
  if (data === undefined) {
    return metas;
  }
  const { pageMeta } = data;

  if (data.url) {
    metas.push({
      property: "og:url",
      content: data.url,
    });
  }

  if (pageMeta.title) {
    metas.push({ title: pageMeta.title });

    metas.push({
      property: "og:title",
      content: pageMeta.title,
    });
  }

  metas.push({ property: "og:type", content: "website" });

  const origin = `https://${data.host}`;

  if (siteName) {
    metas.push({
      property: "og:site_name",
      content: siteName,
    });
    metas.push({
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: siteName,
        url: origin,
      },
    });
  }

  if (pageMeta.excludePageFromSearch || data.excludeFromSearch) {
    metas.push({
      name: "robots",
      content: "noindex, nofollow",
    });
  }

  if (pageMeta.description) {
    metas.push({
      name: "description",
      content: pageMeta.description,
    });
    metas.push({
      property: "og:description",
      content: pageMeta.description,
    });
  }

  if (socialImageAsset) {
    metas.push({
      property: "og:image",
      content: `https://${data.host}${imageLoader({
        src: socialImageAsset.name,
        // Do not transform social image (not enough information do we need to do this)
        format: "raw",
      })}`,
    });
  } else if (pageMeta.socialImageUrl) {
    metas.push({
      property: "og:image",
      content: pageMeta.socialImageUrl,
    });
  }

  metas.push(...pageMeta.custom);

  return metas;
};

export const links: LinksFunction = () => {
  const result: LinkDescriptor[] = [];

  result.push({
    rel: "stylesheet",
    href: css,
  });

  if (favIconAsset) {
    result.push({
      rel: "icon",
      href: imageLoader({
        src: favIconAsset.name,
        // width,height must be multiple of 48 https://developers.google.com/search/docs/appearance/favicon-in-search
        width: 144,
        height: 144,
        fit: "pad",
        quality: 100,
        format: "auto",
      }),
      type: undefined,
    });
  }

  for (const asset of pageFontAssets) {
    result.push({
      rel: "preload",
      href: `${assetBaseUrl}${asset.name}`,
      as: "font",
      crossOrigin: "anonymous",
    });
  }

  for (const backgroundImageAsset of pageBackgroundImageAssets) {
    result.push({
      rel: "preload",
      href: `${assetBaseUrl}${backgroundImageAsset.name}`,
      as: "image",
    });
  }

  return result;
};

const getRequestHost = (request: Request): string =>
  request.headers.get("x-forwarded-host") || request.headers.get("host") || "";

const getMethod = (value: string | undefined) => {
  if (value === undefined) {
    return "post";
  }

  switch (value.toLowerCase()) {
    case "get":
      return "get";
    default:
      return "post";
  }
};

export const action = async ({
  request,
  context,
}: ActionFunctionArgs): Promise<
  { success: true } | { success: false; errors: string[] }
> => {
  try {
    const formData = await request.formData();

    const formId = formData.get(formIdFieldName);

    if (formId == null || typeof formId !== "string") {
      throw new Error("No form id in FormData");
    }

    const formBotValue = formData.get(formBotFieldName);

    if (formBotValue == null || typeof formBotValue !== "string") {
      throw new Error("Form bot field not found");
    }

    const submitTime = parseInt(formBotValue, 16);
    // Assumes that the difference between the server time and the form submission time,
    // including any client-server time drift, is within a 5-minute range.
    // Note: submitTime might be NaN because formBotValue can be any string used for logging purposes.
    // Example: `formBotValue: jsdom`, or `formBotValue: headless-env`
    if (
      Number.isNaN(submitTime) ||
      Math.abs(Date.now() - submitTime) > 1000 * 60 * 5
    ) {
      throw new Error(`Form bot value invalid ${formBotValue}`);
    }

    const formProperties = formsProperties.get(formId);

    // form properties are not defined when defaults are used
    const { action, method } = formProperties ?? {};

    if (contactEmail === undefined) {
      throw new Error("Contact email not found");
    }

    const pageUrl = new URL(request.url);
    pageUrl.host = getRequestHost(request);

    if (action !== undefined) {
      try {
        // Test that action is full URL
        new URL(action);
      } catch {
        throw new Error(
          "Invalid action URL, must be valid http/https protocol"
        );
      }
    }

    const formInfo = {
      formData,
      projectId,
      action: action ?? null,
      method: getMethod(method),
      pageUrl: pageUrl.toString(),
      toEmail: contactEmail,
      fromEmail: pageUrl.hostname + "@webstudio.email",
    } as const;

    const result = await n8nHandler({
      formInfo,
      hookUrl: context.N8N_FORM_EMAIL_HOOK,
    });

    return result;
  } catch (error) {
    console.error(error);

    return {
      success: false,
      errors: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
};

const Outlet = () => {
  const { system, resources, url } = useLoaderData<typeof loader>();
  return (
    <ReactSdkContext.Provider
      value={{
        imageLoader,
        assetBaseUrl,
        imageBaseUrl,
        resources,
      }}
    >
      {/* Use the URL as the key to force scripts in HTML Embed to reload on dynamic pages */}
      <Page key={url} system={system} />
    </ReactSdkContext.Provider>
  );
};

export default Outlet;
