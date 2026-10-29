"use client";

import { commitMono, instrumentSans } from "@/lib/fonts";
import { cn } from "@/lib/cn";
import ErrorPage from "./error";
import "./globals.css";

/** An error in the root layout itself: the page has to bring its own document. */
export default function GlobalError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr" className={cn(instrumentSans.variable, commitMono.variable)}>
      <body>
        <ErrorPage {...props} />
      </body>
    </html>
  );
}
