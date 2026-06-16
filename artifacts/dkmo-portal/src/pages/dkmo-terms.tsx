import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ShieldCheck, ArrowLeft, Printer } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const CONDITIONS = [
  "DKMO (Dakshina Karnataka Muslim Ookota) is a community trust established to support members of the Dakshina Karnataka Muslim community residing in Saudi Arabia.",
  "Membership is open to all Muslims from Dakshina Karnataka, Karnataka, India, currently residing or working in Saudi Arabia.",
  "Each member is required to pay a one-time life membership fee of SR 100 at the time of registration.",
  "Members are required to contribute a minimum of SR 50 for each FRF (Family Relief Fund) incident notified by the General Secretary.",
  "In case of death of a DKMO member, the General Secretary will issue a memorandum to all members and the collected contributions will be handed over to the deceased member's family.",
  "Members who fail to contribute to an FRF incident will retain their DKMO membership, but their family will not be entitled to FRF benefits.",
  "A member on leave must contribute to any incident upon return, or someone else must pay on their behalf within one month of the incident.",
  "A member departing Saudi Arabia on re-entry or exit visa remains covered for 6 months from the date of departure. Coverage ceases if the member does not return within 6 months.",
  "Members must immediately notify the General Secretary of DKMO of any changes to their contact information.",
  "Membership may be revoked for conduct unbecoming of a member, non-payment of dues, or providing false information at the time of registration.",
  "Members who have been expelled shall not be eligible for any benefits of the organisation.",
  "The decision of the DKMO committee shall be final and binding in all matters related to membership and benefits.",
];

export default function DkmoTermsPage() {
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
          <img src={`${basePath}/logo.png`} alt="DKMO" className="h-14 w-auto print:block" />
          <div>
            <h1 className="text-xl font-bold text-green-900 dark:text-green-100">Dakshina Karnataka Muslim Ookota</h1>
            <p className="text-sm text-green-700/70 dark:text-green-400/70">DKMO Riyadh — Membership Terms &amp; Conditions</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-green-200 dark:border-slate-700 shadow-sm p-8 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-green-100 dark:border-slate-700">
            <div className="h-10 w-10 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-green-700 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-green-950 dark:text-green-100">DKMO Membership Terms &amp; Conditions</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Dakshina Karnataka Muslim Ookota — Membership Rules &amp; Obligations</p>
            </div>
          </div>

          {/* Objective */}
          <section>
            <h3 className="text-base font-semibold text-green-900 dark:text-green-200 mb-2">Objective of DKMO</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              DKMO is a non-profit community organisation established to provide mutual support to members of the Dakshina Karnataka Muslim community in Saudi Arabia, including financial assistance through the Family Relief Fund (FRF) for bereaved families of deceased members.
            </p>
          </section>

          {/* Conditions */}
          <section>
            <h3 className="text-base font-semibold text-green-900 dark:text-green-200 mb-4">Terms &amp; Conditions of Membership</h3>
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
              "I have read and understood the above terms and conditions and agree to abide by them. I confirm that all information provided in my application is true and accurate."
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
            onClick={() => setLocation("/dkmo-apply")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
          <Button
            className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white"
            onClick={() => setLocation("/dkmo-apply")}
          >
            Apply for DKMO Membership
          </Button>
        </div>
      </div>
    </div>
  );
}
