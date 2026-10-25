import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/placeholders";

export const metadata: Metadata = { title: "Diffusion" };

export default function Page() {
  return <Placeholder screen="serving" />;
}
