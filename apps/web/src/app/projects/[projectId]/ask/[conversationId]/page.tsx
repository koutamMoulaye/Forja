import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/placeholders";

export const metadata: Metadata = { title: "Poser une question" };

export default function Page() {
  return <Placeholder screen="ask" />;
}
