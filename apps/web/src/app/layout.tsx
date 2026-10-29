import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { commitMono, instrumentSans } from "@/lib/fonts";
import { themeInitScript } from "@/lib/theme/theme";
import { cn } from "@/lib/cn";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Forja", template: "%s · Forja" },
  description: "Pipelines de données Bronze, Silver et Gold, relus règle par règle.",
  applicationName: "Forja",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1917" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Set by the proxy with the page's Content-Security-Policy.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={cn(instrumentSans.variable, commitMono.variable)}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
