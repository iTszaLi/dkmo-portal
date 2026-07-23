import { useParams, Link, Redirect } from "wouter";
import { ArrowLeft } from "lucide-react";
import WelfareModule from "@/components/welfare/WelfareModule";
import { isServiceType } from "@/lib/welfare-config";

export default function WelfareServicePage() {
  const params = useParams();
  const type = params.type;

  if (!isServiceType(type)) {
    return <Redirect to="/services" />;
  }

  return (
    <div className="space-y-4">
      <Link href="/services" className="inline-flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Welfare Programs
      </Link>
      <WelfareModule serviceType={type} />
    </div>
  );
}
