import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ShieldCheck, ArrowLeft, Printer } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const CONDITIONS = [
  "FRF will be monitored by Dakshina Karnataka Muslim Okkoota (DKMO) in Riyadh.",
  "To become a member of FRF, one should first become a Life member of DKMO.",
  "To become a Life member of DKMO, an application needs to be filled and submitted with an amount of 100 SR.",
  "FRF is solely for the residents of Dakshina Karnataka working in Saudi Arabia.",
  "In case of death of a DKMO member, the General Secretary of DKMO will issue a memorandum to all members of DKMO informing the case and to contribute for the cause.",
  "In case of death of a DKMO member, a minimum amount of SR 50 must be contributed by all DKMO members immediately and the contributed funds will be handed over to the deceased family.",
  "Those who did not contribute as stated in point #6 above — such person's membership with DKMO will remain as it is, but his family will not be entitled for FRF scheme benefits.",
  "In case a DKMO member is on leave, he must contribute to the incident upon his return, or someone else must pay on behalf of him within a month from the date of the last incident.",
  "A member of DKMO departing Saudi Arabia on re-entry visa or exit visa is eligible for coverage for 6 months from the date of his departure from Saudi Arabia.",
  "The coverage will not be provided for the person extending his stay after 6 months in India. If he returns back to Saudi after 6 months, his membership will continue if it is valid.",
  "Those who are dispelled from membership shall not be eligible for any benefit executed by this organisation.",
  "The decision of DKMO committee will be last and final.",
];

export default function FrfTermsPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-green-50 via-white to-orange-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-4 py-8">
      <div className="absolute top-4 right-4 z-20 flex gap-2">
        <Button variant="ghost" size="icon" onClick={() => window.print()} className="text-slate-600 dark:text-slate-400">
          <Printer className="h-4 w-4" />
        </Button>
        <ThemeToggle />
      </div>

      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <img src={`${basePath}/logo-circle.png`} alt="DKMO" className="h-14 w-14 rounded-full object-cover print:block" />
          <div>
            <h1 className="text-xl font-bold text-green-900 dark:text-green-100">Dakshina Karnataka Muslim Ookota</h1>
            <p className="text-sm text-green-700/70 dark:text-green-400/70">DKMO Riyadh — Family Relief Fund</p>
          </div>
        </div>

        {/* Title card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-green-200 dark:border-slate-700 shadow-sm p-8 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-green-100 dark:border-slate-700">
            <div className="h-10 w-10 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-green-700 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-green-950 dark:text-green-100">FRF Terms &amp; Conditions</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Family Relief Fund — Membership Rules &amp; Obligations</p>
            </div>
          </div>

          {/* Objective */}
          <section>
            <h3 className="text-base font-semibold text-green-900 dark:text-green-200 mb-2">Objective of Family Relief Fund (FRF)</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              FRF is one of the projects of DKMO and the objective is to ensure an immediate financial support for families of deceased who is a member of DKMO.
            </p>
          </section>

          {/* Conditions */}
          <section>
            <h3 className="text-base font-semibold text-green-900 dark:text-green-200 mb-4">Conditions of FRF</h3>
            <ol className="space-y-4">
              {CONDITIONS.map((condition, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 h-6 w-6 rounded-full bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{condition}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* Declaration */}
          <section className="pt-4 border-t border-green-100 dark:border-slate-700">
            <p className="text-sm font-medium text-green-900 dark:text-green-200 mb-1">Declaration</p>
            <p className="text-sm text-slate-700 dark:text-slate-300 italic">
              "I have read and understood the above terms and conditions and abide by therein."
            </p>
          </section>

          {/* Important note */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">Important Note</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              In case of any changes in your Contact Information, you are required to inform the General Secretary of DKMO immediately.
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center mt-6 print:hidden">
          <Button
            variant="outline"
            className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300"
            onClick={() => setLocation("/frf-apply")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
          <Button
            className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white"
            onClick={() => setLocation("/frf-apply")}
          >
            Apply for FRF Membership
          </Button>
        </div>
      </div>
    </div>
  );
}
