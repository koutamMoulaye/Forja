import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/placeholders";

export const metadata: Metadata = { title: "Revue du plan Silver" };

export default function Page() {
  return <Placeholder screen="silver-plan" />;
}
