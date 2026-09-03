import type { Metadata } from "next";

// Covers /register and /register/google — both client components, neither indexable.
export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
