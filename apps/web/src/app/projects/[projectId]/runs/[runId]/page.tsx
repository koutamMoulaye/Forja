import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/placeholders";

export const metadata: Metadata = { title: "Détail du run" };

export default function Page() {
  return <Placeholder screen="run-detail" />;
}
