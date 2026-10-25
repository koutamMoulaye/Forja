import type { Metadata, Viewport } from "next";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={cn(instrumentSans.variable, commitMono.variable)}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
