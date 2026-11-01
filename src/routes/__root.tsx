import mantineCoreStyles from "@mantine/core/styles.css?url";
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from "@mantine/core";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DataProvider } from "../data/provider";
import "../styles/stylex.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SpaceX changelogs" },
    ],
    links: [{ rel: "stylesheet", href: mantineCoreStyles }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript />
        <HeadContent />
        {import.meta.env.DEV ? (
          <>
            <link rel="stylesheet" href="/virtual:stylex.css" />
            <script type="module" src="/@id/virtual:stylex:runtime" />
          </>
        ) : null}
      </head>
      <body>
        {/* Full HTML document. Start streams this shell with React SSR. */}
        <MantineProvider>
          <DataProvider>{children}</DataProvider>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  );
}
