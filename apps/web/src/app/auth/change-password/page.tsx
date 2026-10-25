import type { Metadata } from "next";
import { PasswordForm } from "@/components/auth/password-form";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default function ChangePasswordPage() {
  return <PasswordForm />;
}
