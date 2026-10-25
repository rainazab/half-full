"use client";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import Charm from "./Charm";
import NarratorPicker from "./NarratorPicker";
import type { ProfileState } from "./ProfileCard";
import type { PreferencesState } from "@/hooks/usePreferences";
import type { CatchUpMode } from "@/lib/preferences";
import { GoogleMark } from "./ProfilePage";

type Step = "welcome" | "mode" | "voice" | "account";
const MODE_OPTIONS: { id: CatchUpMode; title: string; hint: string }[] = [
  {
    id: "read",
    title: "I like to read",
    hint: "Short, clear stories you can scroll.",
  },
  {
    id: "listen",
    title: "I like to listen",
    hint: "A calm narrator reads each story.",
  },
  {
    id: "both",
    title: "A little of both",
    hint: "Read when you can, listen when you can’t.",
  },
];
/**
 * Four short screens: welcome, how you catch up, narrator (skippable),
 * optional Google sign-in. Answers only change presentation and listening
 * preferences on this device; the edition itself is the same for everyone.
 */
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
  const { preferences, update } = settings;
  const steps: Step[] = ["welcome", "mode", "voice", "account"];
  const position = steps.indexOf(step);
  const next = () => setStep(steps[Math.min(steps.length - 1, position + 1)]);
  const transition = reduced
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 32 };
  return (
    <section className="onboarding" aria-label="Welcome to half full">
      <motion.div
        key={step}
        className={`onboarding-step step-${step}`}
        initial={reduced ? false : { opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={transition}
      >
        {step === "welcome" && (
          <>
            <div className="onboarding-art" aria-hidden="true">
              <Charm mood="blue" />
              <Charm mood="yellow" />
              <Charm mood="mint" />
            </div>
            <p className="onboarding-wordmark">half full</p>
            <h1>
              The world has a lot going on.
              <span>You don’t have to keep up with all of it.</span>
            </h1>
            <p className="onboarding-lead">
              A few stories. A little perspective. Then back to your day.
            </p>
            <div className="onboarding-actions">
              <button className="primary" onClick={next}>
                Let’s get caught up
              </button>
              <button className="quiet" onClick={() => onDone(true)}>
                Skip the intro
              </button>
            </div>
          </>
        )}
        {step === "mode" && (
          <>
            <p className="eyebrow">1 of 3</p>
            <h1>How do you like to catch up?</h1>
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
                  <strong>{option.title}</strong>
                  <span>{option.hint}</span>
                </button>
              ))}
            </div>
            <p className="onboarding-note">
              This changes how your edition is presented, never which stories
              are in it.
            </p>
            <div className="onboarding-actions">
              <button
                className="primary"
                onClick={() =>
                  setStep(preferences.mode === "read" ? "account" : "voice")
                }
              >
                Continue
              </button>
            </div>
          </>
        )}
        {step === "voice" && (
          <>
            <p className="eyebrow">2 of 3</p>
            <h1>Choose your narrator</h1>
            <p className="onboarding-lead">
              Who reads the stories aloud. You can change this any time in
              Profile.
            </p>
            <NarratorPicker
              value={preferences.narrator}
              onChange={(narrator) => update({ narrator })}
            />
            <div className="onboarding-actions">
              <button className="primary" onClick={next}>
                Continue
              </button>
              <button className="quiet" onClick={next}>
                Skip for now
              </button>
            </div>
          </>
        )}
        {step === "account" && (
          <>
            <p className="eyebrow">
              {preferences.mode === "read" ? "2 of 2" : "3 of 3"}
            </p>
            <h1>Keep your progress anywhere</h1>
            <p className="onboarding-lead">
              Sign in with Google to carry finished editions and reactions
              across devices. Reading works without it.
            </p>
            <div className="onboarding-actions">
              {profile.user ? (
                <p className="onboarding-signed-in">
                  Signed in as {profile.user.displayName || profile.user.email}.
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
                {profile.user ? "Open my edition" : "Maybe later"}
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
      <div className="onboarding-dots" aria-hidden="true">
        {steps.map((item) => (
          <i key={item} className={item === step ? "active" : ""} />
        ))}
      </div>
    </section>
  );
}
