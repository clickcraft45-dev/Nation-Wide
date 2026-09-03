import type { Metadata } from "next";

// app/login/page.tsx is a client component and cannot export metadata itself.
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
