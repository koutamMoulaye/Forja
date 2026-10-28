import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/placeholders";

export const metadata: Metadata = { title: "Indicateurs" };

export default function Page() {
  return <Placeholder screen="metrics" />;
}
