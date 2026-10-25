import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Forja", template: "%s · Forja" },
  description: "Pipelines de données Bronze, Silver et Gold, relus règle par règle.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
