"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import NarratorPicker from "./NarratorPicker";
import type { ProfileState } from "./ProfileCard";
import type { PreferencesState } from "@/hooks/usePreferences";
import type { CatchUpMode } from "@/lib/preferences";
import { GoogleMark } from "./ProfilePage";
import DitheredAtmosphere from "./DitheredAtmosphere";
import BrandWorldArtwork from "./BrandWorldArtwork";
import Icon from "./Icon";

type Step = "welcome" | "mode" | "voice" | "account";
const MODE_OPTIONS: { id: CatchUpMode; title: string; hint: string }[] = [
  {
    id: "read",
    title: "Read it.",
    hint: "A few clear stories, at your own pace.",
  },
  {
    id: "listen",
    title: "Listen to it.",
    hint: "Press play. We’ll take it from here.",
  },
  { id: "both", title: "A little of both.", hint: "Whatever fits your day." },
];
function ModeSymbol({ mode }: { mode: CatchUpMode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {mode === "read" ? (
        <>
          <path
            d="M3 5C6 4 9 5 12 7C15 5 18 4 21 5V19C18 18 15 19 12 21C9 19 6 18 3 19V5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M12 7V20M6 8L9 9M6 12L9 13M15 9L18 8M15 13L18 12"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </>
      ) : mode === "listen" ? (
        <>
          <path
            d="M4 14V10A8 8 0 0 1 20 10V14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <rect x="3" y="11" width="4" height="9" rx="2" fill="currentColor" />
          <rect x="17" y="11" width="4" height="9" rx="2" fill="currentColor" />
        </>
      ) : (
        <>
          <path
            d="M6 8L12 5L18 8V17L12 20L6 17V8Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M12 6V19M3 10V15M21 10V15"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

/** Two preferences, then an optional account; all content stays shared. */
export default function OnboardingFlow({
  profile,
  settings,
  onDone,
}: {
  profile: ProfileState;
  settings: PreferencesState;
  onDone: (skipped: boolean) => void;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const reduced = useReducedMotion();
  const title = useRef<HTMLHeadingElement>(null);
  const { preferences, update } = settings;
  const steps: Step[] = ["welcome", "mode", "voice", "account"];
  const position = steps.indexOf(step);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    title.current?.focus({ preventScroll: true });
  }, [step]);
  function back() {
    setStep(
      step === "account" && preferences.mode === "read"
        ? "mode"
        : steps[Math.max(0, position - 1)],
    );
  }
  return (
    <section
      className="library-screen onboarding library-onboarding"
      aria-label="Welcome to half full"
    >
      <DitheredAtmosphere tone="lavender" intensity={0.18} />
      <header className="intro-masthead">
        <p className="onboarding-wordmark">
          <img src="/icon.png" alt="" width={28} height={28} /> half full
        </p>
        {step !== "welcome" && (
          <button className="intro-back" onClick={back}>
            <Icon name="back" size={15} />
            Back
          </button>
        )}
      </header>
      <div className="intro-flow-content">
        <motion.div
          key={step}
          className={`onboarding-step step-${step}`}
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.32, ease: "easeOut" }}
        >
          {step === "welcome" && (
            <>
              <div className="welcome-illustrated-world">
                <BrandWorldArtwork variant="welcome" />
              </div>
              <h1 ref={title} tabIndex={-1}>
                The world is a lot.<span>The news doesn’t have to be.</span>
              </h1>
              <p className="onboarding-lead">
                A few stories. A little perspective. Then back to your day.
              </p>
              <div className="onboarding-actions">
                <button className="primary" onClick={() => setStep("mode")}>
                  Let’s get caught up
                </button>
                <button className="quiet" onClick={() => onDone(true)}>
                  Skip for now
                </button>
              </div>
            </>
          )}
          {step === "mode" && (
            <>
              <div className="mode-selection-art" aria-hidden="true">
                <BrandWorldArtwork variant="handoff" />
              </div>
              <p className="onboarding-kicker">
                Make yourself at home · 1 of 2
              </p>
              <h1 ref={title} tabIndex={-1}>
                How do you like your news?
              </h1>
              <div
                className="onboarding-options"
                role="radiogroup"
                aria-label="How you catch up"
              >
                {MODE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={preferences.mode === option.id}
                    className={`onboarding-option${preferences.mode === option.id ? " selected" : ""}`}
                    onClick={() =>
                      update({
                        mode: option.id,
                        autoplayNext: option.id === "listen",
                      })
                    }
                  >
                    <span className="mode-option-symbol" data-mode={option.id}>
                      <ModeSymbol mode={option.id} />
                    </span>
                    <span className="mode-option-label">
                      <strong>{option.title}</strong>
                      <small>{option.hint}</small>
                    </span>
                    <span className="selection-dot" aria-hidden="true">
                      {preferences.mode === option.id && (
                        <Icon name="check" size={12} />
                      )}
                    </span>
                  </button>
                ))}
              </div>
              <div className="onboarding-actions">
                <button
                  className="primary"
                  onClick={() =>
                    setStep(preferences.mode === "read" ? "account" : "voice")
                  }
                >
                  Continue <span aria-hidden="true">→</span>
                </button>
              </div>
            </>
          )}
          {step === "voice" && (
            <>
              <p className="onboarding-kicker">
                Make yourself at home · 2 of 2
              </p>
              <h1 ref={title} tabIndex={-1}>
                Pick your news voice.
              </h1>
              <p className="onboarding-lead">
                A familiar voice for your daily catch-up.
              </p>
              <NarratorPicker
                value={preferences.narrator}
                onChange={(narrator) => update({ narrator })}
              />
              <div className="onboarding-actions">
                <button className="primary" onClick={() => setStep("account")}>
                  Sounds good
                </button>
                <button className="quiet" onClick={() => setStep("account")}>
                  Choose later
                </button>
              </div>
            </>
          )}
          {step === "account" && (
            <>
              <div className="onboarding-account-art">
                <BrandWorldArtwork variant="completion" />
              </div>
              <p className="onboarding-kicker">
                One last thing · completely optional
              </p>
              <h1 ref={title} tabIndex={-1}>
                A little progress, wherever you are.
              </h1>
              <p className="onboarding-lead">
                Keep finished editions and reactions with you. Or just start
                reading.
              </p>
              <div className="onboarding-actions">
                {profile.user ? (
                  <p className="onboarding-signed-in">
                    You’re signed in as{" "}
                    {profile.user.displayName || profile.user.email}.
                  </p>
                ) : (
                  <button
                    className="google-signin"
                    disabled={!profile.ready || profile.signingIn}
                    onClick={() => void profile.login()}
                  >
                    <GoogleMark />
                    {profile.signingIn ? "Signing in…" : "Continue with Google"}
                  </button>
                )}
                <button className="primary" onClick={() => onDone(false)}>
                  {profile.user ? "Open my edition" : "Keep going as a guest"}
                </button>
              </div>
              {profile.error && (
                <p className="onboarding-note" role="alert">
                  {profile.error}
                </p>
              )}
            </>
          )}
        </motion.div>
      </div>
      {step !== "welcome" && (
        <div className="intro-step-indicator" aria-hidden="true">
          <i
            style={{
              transform: `scaleX(${steps.indexOf(step) / (steps.length - 1)})`,
            }}
          />
        </div>
      )}
    </section>
  );
}
