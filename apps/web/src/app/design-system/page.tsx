import type { Metadata } from "next";
import { DesignSystem } from "@/components/design-system/design-system";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

/** Internal page; the proxy answers 404 in production unless FORJA_WEB_DESIGN_SYSTEM=true. */
export default function DesignSystemPage() {
  return <DesignSystem />;
}
