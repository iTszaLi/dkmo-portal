import { useState } from "react";
import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation } from "wouter";
import {
  ShieldCheck, ArrowLeft, Printer, Target, ScrollText, FileSignature,
  Info, Languages, BadgeIndianRupee, HandCoins, UserCheck, HeartHandshake,
} from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type Lang = "en" | "kn" | "both";

type Highlight = {
  label: { en: string; kn: string };
  icon: typeof BadgeIndianRupee;
};

type Clause = {
  en: string;
  kn: string;
  highlight?: Highlight;
};

const HL = {
  fee: { label: { en: "Membership Fee · SR 100", kn: "ಸದಸ್ಯತ್ವ ಶುಲ್ಕ · SR 100" }, icon: BadgeIndianRupee },
  frf: { label: { en: "FRF Contribution · SR 50 / incident", kn: "ಎಫ್‌ಆರ್‌ಎಫ್ ಕೊಡುಗೆ · SR 50 / ಘಟನೆ" }, icon: HandCoins },
  eligibility: { label: { en: "Membership Eligibility", kn: "ಸದಸ್ಯತ್ವ ಅರ್ಹತೆ" }, icon: UserCheck },
  benefit: { label: { en: "Benefit Conditions", kn: "ಸೌಲಭ್ಯ ಷರತ್ತುಗಳು" }, icon: HeartHandshake },
} satisfies Record<string, Highlight>;

const OBJECTIVE = {
  en: "DKMO is a non-profit community organisation established to provide mutual support to members of the Dakshina Karnataka Muslim community in Saudi Arabia, including financial assistance through the Family Relief Fund (FRF) for bereaved families of deceased members.",
  kn: "ಡಿಕೆಎಂಒ ಒಂದು ಲಾಭರಹಿತ ಸಮುದಾಯ ಸಂಸ್ಥೆಯಾಗಿದ್ದು, ಸೌದಿ ಅರೇಬಿಯಾದಲ್ಲಿರುವ ದಕ್ಷಿಣ ಕನ್ನಡ ಮುಸ್ಲಿಂ ಸಮುದಾಯದ ಸದಸ್ಯರಿಗೆ ಪರಸ್ಪರ ಸಹಕಾರವನ್ನು ಒದಗಿಸಲು ಸ್ಥಾಪಿಸಲಾಗಿದೆ; ಇದರಲ್ಲಿ ಮೃತ ಸದಸ್ಯರ ಶೋಕತಪ್ತ ಕುಟುಂಬಗಳಿಗೆ ಕುಟುಂಬ ಪರಿಹಾರ ನಿಧಿ (ಎಫ್‌ಆರ್‌ಎಫ್) ಮೂಲಕ ಆರ್ಥಿಕ ನೆರವು ಒಳಗೊಂಡಿದೆ.",
};

const CONDITIONS: Clause[] = [
  {
    en: "DKMO (Dakshina Karnataka Muslim Ookota) is a community trust established to support members of the Dakshina Karnataka Muslim community residing in Saudi Arabia.",
    kn: "ಡಿಕೆಎಂಒ (ದಕ್ಷಿಣ ಕನ್ನಡ ಮುಸ್ಲಿಂ ಒಕ್ಕೂಟ) ಸೌದಿ ಅರೇಬಿಯಾದಲ್ಲಿ ವಾಸಿಸುವ ದಕ್ಷಿಣ ಕನ್ನಡ ಮುಸ್ಲಿಂ ಸಮುದಾಯದ ಸದಸ್ಯರಿಗೆ ಬೆಂಬಲ ನೀಡಲು ಸ್ಥಾಪಿಸಲಾದ ಸಮುದಾಯ ಟ್ರಸ್ಟ್ ಆಗಿದೆ.",
  },
  {
    en: "Membership is open to all Muslims from Dakshina Karnataka, Karnataka, India, currently residing or working in Saudi Arabia.",
    kn: "ಪ್ರಸ್ತುತ ಸೌದಿ ಅರೇಬಿಯಾದಲ್ಲಿ ವಾಸಿಸುತ್ತಿರುವ ಅಥವಾ ಕೆಲಸ ಮಾಡುತ್ತಿರುವ ಭಾರತದ ಕರ್ನಾಟಕದ ದಕ್ಷಿಣ ಕನ್ನಡದ ಎಲ್ಲಾ ಮುಸ್ಲಿಮರಿಗೆ ಸದಸ್ಯತ್ವ ಮುಕ್ತವಾಗಿದೆ.",
    highlight: HL.eligibility,
  },
  {
    en: "Each member is required to pay a one-time life membership fee of SR 100 at the time of registration.",
    kn: "ಪ್ರತಿಯೊಬ್ಬ ಸದಸ್ಯರೂ ನೋಂದಣಿ ಸಮಯದಲ್ಲಿ ಒಂದು ಬಾರಿಯ ಜೀವಮಾನ ಸದಸ್ಯತ್ವ ಶುಲ್ಕ SR 100 ಪಾವತಿಸಬೇಕು.",
    highlight: HL.fee,
  },
  {
    en: "Members are required to contribute a minimum of SR 50 for each FRF (Family Relief Fund) incident notified by the General Secretary.",
    kn: "ಪ್ರಧಾನ ಕಾರ್ಯದರ್ಶಿಯವರು ತಿಳಿಸುವ ಪ್ರತಿ ಎಫ್‌ಆರ್‌ಎಫ್ (ಕುಟುಂಬ ಪರಿಹಾರ ನಿಧಿ) ಘಟನೆಗೆ ಸದಸ್ಯರು ಕನಿಷ್ಠ SR 50 ಕೊಡುಗೆ ನೀಡಬೇಕು.",
    highlight: HL.frf,
  },
  {
    en: "In case of death of a DKMO member, the General Secretary will issue a memorandum to all members and the collected contributions will be handed over to the deceased member's family.",
    kn: "ಡಿಕೆಎಂಒ ಸದಸ್ಯರ ಮರಣ ಸಂಭವಿಸಿದಲ್ಲಿ, ಪ್ರಧಾನ ಕಾರ್ಯದರ್ಶಿಯವರು ಎಲ್ಲಾ ಸದಸ್ಯರಿಗೆ ಜ್ಞಾಪನ ಪತ್ರ ಹೊರಡಿಸುತ್ತಾರೆ ಮತ್ತು ಸಂಗ್ರಹಿಸಿದ ಕೊಡುಗೆಗಳನ್ನು ಮೃತ ಸದಸ್ಯರ ಕುಟುಂಬಕ್ಕೆ ಹಸ್ತಾಂತರಿಸಲಾಗುತ್ತದೆ.",
  },
  {
    en: "Members who fail to contribute to an FRF incident will retain their DKMO membership, but their family will not be entitled to FRF benefits.",
    kn: "ಎಫ್‌ಆರ್‌ಎಫ್ ಘಟನೆಗೆ ಕೊಡುಗೆ ನೀಡಲು ವಿಫಲರಾದ ಸದಸ್ಯರು ತಮ್ಮ ಡಿಕೆಎಂಒ ಸದಸ್ಯತ್ವವನ್ನು ಉಳಿಸಿಕೊಳ್ಳುತ್ತಾರೆ, ಆದರೆ ಅವರ ಕುಟುಂಬಕ್ಕೆ ಎಫ್‌ಆರ್‌ಎಫ್ ಸೌಲಭ್ಯಗಳಿಗೆ ಅರ್ಹತೆ ಇರುವುದಿಲ್ಲ.",
    highlight: HL.benefit,
  },
  {
    en: "A member on leave must contribute to any incident upon return, or someone else must pay on their behalf within one month of the incident.",
    kn: "ರಜೆಯಲ್ಲಿರುವ ಸದಸ್ಯರು ಮರಳಿದ ನಂತರ ಯಾವುದೇ ಘಟನೆಗೆ ಕೊಡುಗೆ ನೀಡಬೇಕು, ಅಥವಾ ಘಟನೆ ನಡೆದ ಒಂದು ತಿಂಗಳೊಳಗೆ ಬೇರೊಬ್ಬರು ಅವರ ಪರವಾಗಿ ಪಾವತಿಸಬೇಕು.",
  },
  {
    en: "A member departing Saudi Arabia on re-entry or exit visa remains covered for 6 months from the date of departure. Coverage ceases if the member does not return within 6 months.",
    kn: "ಮರು-ಪ್ರವೇಶ ಅಥವಾ ನಿರ್ಗಮನ ವೀಸಾದಲ್ಲಿ ಸೌದಿ ಅರೇಬಿಯಾ ತೊರೆಯುವ ಸದಸ್ಯರು ನಿರ್ಗಮನ ದಿನಾಂಕದಿಂದ 6 ತಿಂಗಳವರೆಗೆ ರಕ್ಷಣೆ ಪಡೆಯುತ್ತಾರೆ. ಸದಸ್ಯರು 6 ತಿಂಗಳೊಳಗೆ ಮರಳದಿದ್ದರೆ ರಕ್ಷಣೆ ಸ್ಥಗಿತಗೊಳ್ಳುತ್ತದೆ.",
  },
  {
    en: "Members must immediately notify the General Secretary of DKMO of any changes to their contact information.",
    kn: "ಸದಸ್ಯರು ತಮ್ಮ ಸಂಪರ್ಕ ಮಾಹಿತಿಯಲ್ಲಿ ಯಾವುದೇ ಬದಲಾವಣೆಗಳಾದರೆ ತಕ್ಷಣವೇ ಡಿಕೆಎಂಒ ಪ್ರಧಾನ ಕಾರ್ಯದರ್ಶಿಯವರಿಗೆ ತಿಳಿಸಬೇಕು.",
  },
  {
    en: "Membership may be revoked for conduct unbecoming of a member, non-payment of dues, or providing false information at the time of registration.",
    kn: "ಸದಸ್ಯರಿಗೆ ಶೋಭಿಸದ ನಡವಳಿಕೆ, ಬಾಕಿ ಪಾವತಿಸದಿರುವುದು, ಅಥವಾ ನೋಂದಣಿ ಸಮಯದಲ್ಲಿ ಸುಳ್ಳು ಮಾಹಿತಿ ನೀಡಿದ ಕಾರಣಕ್ಕಾಗಿ ಸದಸ್ಯತ್ವವನ್ನು ರದ್ದುಪಡಿಸಬಹುದು.",
  },
  {
    en: "Members who have been expelled shall not be eligible for any benefits of the organisation.",
    kn: "ಹೊರಹಾಕಲ್ಪಟ್ಟ ಸದಸ್ಯರು ಸಂಸ್ಥೆಯ ಯಾವುದೇ ಸೌಲಭ್ಯಗಳಿಗೆ ಅರ್ಹರಾಗಿರುವುದಿಲ್ಲ.",
  },
  {
    en: "The decision of the DKMO committee shall be final and binding in all matters related to membership and benefits.",
    kn: "ಸದಸ್ಯತ್ವ ಮತ್ತು ಸೌಲಭ್ಯಗಳಿಗೆ ಸಂಬಂಧಿಸಿದ ಎಲ್ಲಾ ವಿಷಯಗಳಲ್ಲಿ ಡಿಕೆಎಂಒ ಸಮಿತಿಯ ನಿರ್ಧಾರವೇ ಅಂತಿಮ ಮತ್ತು ಬದ್ಧವಾಗಿರುತ್ತದೆ.",
  },
];

const DECLARATION = {
  en: "I have read and understood the above terms and conditions and agree to abide by them. I confirm that all information provided in my application is true and accurate.",
  kn: "ಮೇಲಿನ ನಿಯಮಗಳು ಮತ್ತು ಷರತ್ತುಗಳನ್ನು ನಾನು ಓದಿ ಅರ್ಥಮಾಡಿಕೊಂಡಿದ್ದೇನೆ ಹಾಗೂ ಅವುಗಳನ್ನು ಪಾಲಿಸಲು ಒಪ್ಪುತ್ತೇನೆ. ನನ್ನ ಅರ್ಜಿಯಲ್ಲಿ ನೀಡಿರುವ ಎಲ್ಲಾ ಮಾಹಿತಿಯು ಸತ್ಯ ಮತ್ತು ನಿಖರವಾಗಿದೆ ಎಂದು ನಾನು ದೃಢೀಕರಿಸುತ್ತೇನೆ.",
};

const IMPORTANT_NOTE = {
  en: "In case of any changes in your Contact Information, you are required to inform the General Secretary of DKMO immediately.",
  kn: "ನಿಮ್ಮ ಸಂಪರ್ಕ ಮಾಹಿತಿಯಲ್ಲಿ ಯಾವುದೇ ಬದಲಾವಣೆಗಳಾದರೆ, ನೀವು ತಕ್ಷಣವೇ ಡಿಕೆಎಂಒ ಪ್ರಧಾನ ಕಾರ್ಯದರ್ಶಿಯವರಿಗೆ ತಿಳಿಸಬೇಕು.",
};

const T = {
  objectiveHeading: { en: "Objective of DKMO", kn: "ಡಿಕೆಎಂಒ ಉದ್ದೇಶ" },
  conditionsHeading: { en: "Terms & Conditions of Membership", kn: "ಸದಸ್ಯತ್ವದ ನಿಯಮಗಳು ಮತ್ತು ಷರತ್ತುಗಳು" },
  declarationHeading: { en: "Declaration", kn: "ಘೋಷಣೆ" },
  noteHeading: { en: "Important Note", kn: "ಮುಖ್ಯ ಸೂಚನೆ" },
  agree: { en: "I agree to the Membership Terms & Conditions", kn: "ನಾನು ಸದಸ್ಯತ್ವದ ನಿಯಮಗಳು ಮತ್ತು ಷರತ್ತುಗಳಿಗೆ ಒಪ್ಪುತ್ತೇನೆ" },
};

const LANG_OPTIONS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "kn", label: "ಕನ್ನಡ" },
  { value: "both", label: "English + ಕನ್ನಡ" },
];

const fade = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
};

function Bilingual({
  en, kn, lang, enClass = "", knClass = "",
}: { en: string; kn: string; lang: Lang; enClass?: string; knClass?: string }) {
  const showEn = lang === "en" || lang === "both";
  const showKn = lang === "kn" || lang === "both";
  return (
    <div className={lang === "both" ? "grid gap-3 sm:grid-cols-2 sm:gap-6" : ""}>
      {showEn && <p className={`leading-relaxed ${enClass}`}>{en}</p>}
      {showKn && (
        <p
          lang="kn"
          className={`leading-loose [font-family:'Noto_Sans_Kannada',sans-serif] ${knClass} ${lang === "both" ? "sm:border-l sm:border-green-200 sm:dark:border-slate-700 sm:pl-6" : ""}`}
        >
          {kn}
        </p>
      )}
    </div>
  );
}

export default function DkmoTermsPage() {
  const [, setLocation] = useLocation();
  const [lang, setLang] = useState<Lang>("both");
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-green-50 via-white to-orange-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-4 py-8">
      <div className="absolute top-4 right-4 z-20 flex gap-2 print:hidden">
        <Button variant="ghost" size="icon" onClick={() => window.print()} className="text-slate-600 dark:text-slate-400">
          <Printer className="h-4 w-4" />
        </Button>
        <ThemeToggle />
      </div>

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial="hidden" animate="show" variants={fade} transition={{ duration: 0.5 }}
          className="flex items-center gap-4 mb-6"
        >
          <img src={`${basePath}/logo-circle.png`} alt="DKMO" className="h-14 w-14 rounded-full object-cover" />
          <div>
            <h1 className="text-xl font-bold text-green-900 dark:text-green-100">Dakshina Karnataka Muslim Ookota</h1>
            <p className="text-sm text-green-700/70 dark:text-green-400/70">DKMO Riyadh — Membership Terms &amp; Conditions</p>
          </div>
        </motion.div>

        {/* Language toggle */}
        <motion.div
          initial="hidden" animate="show" variants={fade} transition={{ duration: 0.5, delay: 0.05 }}
          className="mb-4 flex flex-wrap items-center gap-2 print:hidden"
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
            <Languages className="h-4 w-4" /> Language
          </span>
          <div className="inline-flex rounded-xl border border-green-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-sm">
            {LANG_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={lang === opt.value}
                onClick={() => setLang(opt.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  lang === opt.value
                    ? "bg-green-700 text-white shadow-sm dark:bg-green-600"
                    : "text-green-800 hover:bg-green-50 dark:text-green-300 dark:hover:bg-slate-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Document */}
        <motion.div
          initial="hidden" animate="show" variants={fade} transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-white dark:bg-slate-900 rounded-2xl border border-green-200 dark:border-slate-700 shadow-md overflow-hidden"
        >
          {/* Document banner */}
          <div className="bg-gradient-to-r from-green-700 to-green-800 dark:from-green-800 dark:to-green-900 px-6 sm:px-8 py-5 flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-white/15 flex items-center justify-center ring-1 ring-white/25">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">DKMO Membership Terms &amp; Conditions</h2>
              <p className="text-xs text-green-100/80">Dakshina Karnataka Muslim Ookota — Membership Rules &amp; Obligations</p>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-8">
            {/* Objective */}
            <motion.section variants={fade} initial="hidden" animate="show" transition={{ duration: 0.45, delay: 0.15 }}>
              <h3 className="flex items-center gap-2 text-base font-semibold text-green-900 dark:text-green-200 mb-3">
                <Target className="h-5 w-5 text-green-700 dark:text-green-400" />
                {lang === "kn" ? T.objectiveHeading.kn : lang === "en" ? T.objectiveHeading.en : `${T.objectiveHeading.en} · ${T.objectiveHeading.kn}`}
              </h3>
              <div className="rounded-xl bg-green-50/60 dark:bg-slate-800/40 border border-green-100 dark:border-slate-700 p-4 sm:p-5 text-[15px] text-slate-700 dark:text-slate-300">
                <Bilingual en={OBJECTIVE.en} kn={OBJECTIVE.kn} lang={lang} />
              </div>
            </motion.section>

            {/* Conditions */}
            <section>
              <h3 className="flex items-center gap-2 text-base font-semibold text-green-900 dark:text-green-200 mb-4">
                <ScrollText className="h-5 w-5 text-green-700 dark:text-green-400" />
                {lang === "kn" ? T.conditionsHeading.kn : lang === "en" ? T.conditionsHeading.en : `${T.conditionsHeading.en} · ${T.conditionsHeading.kn}`}
              </h3>

              {/* Column labels (both mode) */}
              {lang === "both" && (
                <div className="hidden sm:grid grid-cols-[2.25rem_1fr] gap-3 mb-2">
                  <span />
                  <div className="grid grid-cols-2 gap-6 text-[11px] font-bold uppercase tracking-wide text-green-700/70 dark:text-green-400/70">
                    <span>English</span>
                    <span className="border-l border-green-200 dark:border-slate-700 pl-6">ಕನ್ನಡ</span>
                  </div>
                </div>
              )}

              <ol className="space-y-3">
                {CONDITIONS.map((c, i) => {
                  const hl = c.highlight;
                  return (
                    <motion.li
                      key={i}
                      variants={fade}
                      initial="hidden"
                      animate="show"
                      transition={{ duration: 0.4, delay: 0.04 * i }}
                      className={`rounded-xl p-3 sm:p-4 ${
                        hl
                          ? "bg-green-50 dark:bg-green-900/20 ring-1 ring-green-200 dark:ring-green-800/60"
                          : i % 2 === 0
                            ? "bg-slate-50/70 dark:bg-slate-800/30"
                            : "bg-transparent"
                      }`}
                    >
                      <div className="grid grid-cols-[2.25rem_1fr] gap-3">
                        <span className={`flex-shrink-0 h-7 w-7 rounded-full text-xs font-bold flex items-center justify-center mt-0.5 ${
                          hl ? "bg-green-700 text-white dark:bg-green-600" : "bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300"
                        }`}>
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          {hl && (
                            <span className="inline-flex items-center gap-1.5 mb-2 rounded-full bg-green-700 dark:bg-green-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                              <hl.icon className="h-3.5 w-3.5" />
                              {lang === "kn" ? hl.label.kn : hl.label.en}
                            </span>
                          )}
                          <Bilingual en={c.en} kn={c.kn} lang={lang} enClass="text-[15px] text-slate-700 dark:text-slate-300" knClass="text-[15px] text-slate-700 dark:text-slate-300" />
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </ol>
            </section>

            {/* Declaration */}
            <motion.section
              variants={fade} initial="hidden" animate="show" transition={{ duration: 0.45 }}
              className="pt-2"
            >
              <h3 className="flex items-center gap-2 text-base font-semibold text-green-900 dark:text-green-200 mb-3">
                <FileSignature className="h-5 w-5 text-green-700 dark:text-green-400" />
                {lang === "kn" ? T.declarationHeading.kn : lang === "en" ? T.declarationHeading.en : `${T.declarationHeading.en} · ${T.declarationHeading.kn}`}
              </h3>
              <div className="rounded-xl border border-green-200 dark:border-slate-700 bg-green-50/40 dark:bg-slate-800/40 p-4 sm:p-5 text-[15px] italic text-slate-700 dark:text-slate-300">
                <Bilingual en={`“${DECLARATION.en}”`} kn={`“${DECLARATION.kn}”`} lang={lang} />
              </div>
            </motion.section>

            {/* Important note */}
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-4 sm:p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
                <Info className="h-4 w-4" />
                {lang === "kn" ? T.noteHeading.kn : lang === "en" ? T.noteHeading.en : `${T.noteHeading.en} · ${T.noteHeading.kn}`}
              </p>
              <Bilingual en={IMPORTANT_NOTE.en} kn={IMPORTANT_NOTE.kn} lang={lang} enClass="text-sm text-amber-700 dark:text-amber-400" knClass="text-sm text-amber-700 dark:text-amber-400" />
            </div>

            {/* Acceptance */}
            <div className="rounded-xl border border-green-300 dark:border-green-800 bg-white dark:bg-slate-800/60 p-4 sm:p-5 print:hidden">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={accepted}
                  onCheckedChange={(v) => setAccepted(v === true)}
                  className="mt-0.5 data-[state=checked]:bg-green-700 data-[state=checked]:border-green-700"
                />
                <span className="space-y-1">
                  {(lang === "en" || lang === "both") && (
                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">{T.agree.en}</span>
                  )}
                  {(lang === "kn" || lang === "both") && (
                    <span lang="kn" className="block text-sm font-medium text-slate-800 dark:text-slate-200 [font-family:'Noto_Sans_Kannada',sans-serif]">{T.agree.kn}</span>
                  )}
                </span>
              </label>
            </div>
          </div>
        </motion.div>

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mt-6 print:hidden">
          <Button
            variant="outline"
            className="border-green-300 dark:border-green-800 text-green-800 dark:text-green-300"
            onClick={() => setLocation("/dkmo-apply")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
          <Button
            disabled={!accepted}
            className="bg-green-800 hover:bg-green-900 dark:bg-green-700 dark:hover:bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setLocation("/dkmo-apply")}
          >
            Apply for DKMO Membership
          </Button>
        </div>
      </div>
    </div>
  );
}
