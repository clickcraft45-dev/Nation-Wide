"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LogOut } from "lucide-react";
import { useAuth } from "@/state/auth-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChangePasswordForm } from "@/components/settings/change-password-form";

export default function AdminSettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/admin/login");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account, security, and platform configuration.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manager profile</CardTitle>
        </CardHeader>
        <CardContent>
          {user && (
            <div className="flex items-center gap-3">
              <Avatar label={user.email} className="h-11 w-11 text-sm" />
              <div>
                <p className="text-sm font-medium text-foreground">{user.email}</p>
                <Badge variant="neutral" className="mt-1">
                  {user.role}
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provider settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Monitor call health and error rates for each shipping provider adapter.
          </p>
          <Link
            href="/admin/integrations"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            View integration health
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System information</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Every staff mutation is recorded in the audit log for compliance.
          </p>
          <Link
            href="/admin/audit-logs"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            View audit log
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Coming soon.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Coming soon.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            You&apos;re currently signed in on this device.
          </p>
          <Button variant="danger" size="sm" onClick={handleLogout}>
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
