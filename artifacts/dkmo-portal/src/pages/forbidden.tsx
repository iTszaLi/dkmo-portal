import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { useAuth, defaultLandingForRole } from "@/lib/auth";

export default function Forbidden() {
  const { user } = useAuth();
  const home = user ? defaultLandingForRole(user.role) : "/dashboard";
  return (
    <div className="flex items-center justify-center py-24">
      <Card className="rounded-2xl border-red-100 shadow-sm max-w-md w-full">
        <CardContent className="pt-8 pb-8 text-center space-y-3">
          <div className="mx-auto h-14 w-14 rounded-full bg-red-50 flex items-center justify-center">
            <ShieldAlert className="h-7 w-7 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-red-900">403 — Forbidden</h1>
          <p className="text-sm text-red-800/80">
            You don't have permission to view this page.
          </p>
          <Link href={home}>
            <Button variant="outline" className="mt-2 border-red-200 text-red-700">
              <ArrowLeft className="h-4 w-4 mr-1" /> Go back
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
