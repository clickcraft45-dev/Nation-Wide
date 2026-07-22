import { redirect } from "next/navigation";

// There is a single unified login page (the root route) — this path is kept only so old
// links/bookmarks don't 404, per the single-root-login requirement.
export default function AdminLoginRedirect() {
  redirect("/");
}
