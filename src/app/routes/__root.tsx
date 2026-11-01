import mantineCoreStyles from "@mantine/core/styles.css?url";
import mantineSpotlightStyles from "@mantine/spotlight/styles.css?url";
import mantineTiptapStyles from "@mantine/tiptap/styles.css?url";
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from "@mantine/core";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Frame } from "../../components/frame";
import { theme } from "../../config/theme";
import { DataProvider } from "../provider";
import { WorkspaceProvider } from "../../stores/workspace";
import "../../styles/stylex.css";

export const Route = createRootRoute({
  ssr: false,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SpaceX changelogs" },
    ],
    links: [
      { rel: "stylesheet", href: mantineCoreStyles },
      { rel: "stylesheet", href: mantineSpotlightStyles },
      { rel: "stylesheet", href: mantineTiptapStyles },
    ],
  }),
  component: RootLayout,
  shellComponent: RootDocument,
});

function RootLayout() {
  return (
    <Frame>
      <Outlet />
    </Frame>
  );
}

function RootDocument({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="ja" {...mantineHtmlProps}>
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
        <MantineProvider theme={theme}>
          <DataProvider>
            <WorkspaceProvider>{children}</WorkspaceProvider>
          </DataProvider>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  );
}
