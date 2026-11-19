import type { Metadata } from "next";

// Covers /forgot-password, a client component and not indexable.
export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
