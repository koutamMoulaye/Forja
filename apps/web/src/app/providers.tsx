"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { setNonce } from "get-nonce";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failures, error) =>
          !(error instanceof ApiError && error.status < 500) && failures < 2,
      },
      mutations: { retry: false },
    },
  });
}

/**
 * `nonce`: the page's Content-Security-Policy nonce, for the style elements that motion
 * and the scroll lock of dialogs add at run time.
 */
export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  if (nonce && typeof document !== "undefined") setNonce(nonce);
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user" nonce={nonce}>
        <TooltipProvider delayDuration={400} skipDelayDuration={200}>
          {children}
          <Toaster />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
