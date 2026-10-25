"use client";
import type { ProfileState } from "./ProfileCard";
import { ProfileAvatar } from "./ProfileCard";
import NarratorPicker from "./NarratorPicker";
import DitheredAtmosphere from "./DitheredAtmosphere";
import Icon from "./Icon";
import type { PreferencesState } from "@/hooks/usePreferences";
import { SPEEDS, type CatchUpMode } from "@/lib/preferences";

export function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path
        fill="#4285F4"
        d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.9 6.1-15Z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20.4 20.4 0 0 0 24 44Z"
      />
      <path
        fill="#FBBC05"
        d="M12.6 27.5a12.2 12.2 0 0 1 0-7.8v-5.3H5.8a20.4 20.4 0 0 0 0 18.4l6.8-5.3Z"
      />
      <path
        fill="#EA4335"
        d="M24 11.9c3 0 5.6 1 7.7 3l5.8-5.8A19.4 19.4 0 0 0 24 4 20.4 20.4 0 0 0 5.8 14.4l6.8 5.3A12 12 0 0 1 24 11.9Z"
      />
    </svg>
  );
}

const MODE_LABELS: Record<CatchUpMode, string> = {
  read: "Read",
  listen: "Listen",
  both: "A little of both",
};
/** Identity and presentation preferences. The shared reporting never changes. */
export default function ProfilePage({
  profile,
  settings,
  onOpenJar,
  onReplayIntro,
}: {
  profile: ProfileState;
  settings: PreferencesState;
  onOpenJar: () => void;
  onReplayIntro?: () => void;
}) {
  const { user, ready, signingIn, sync, error, login, logout, retry } = profile;
  const { preferences, update } = settings;
  return (
    <section className="library-screen library-profile" aria-label="Profile">
      <DitheredAtmosphere tone="lavender" intensity={0.08} />
      <section className="profile-identity-scenery" aria-label="Your account">
        <div className="profile-identity">
          <div className="profile-avatar">
            <ProfileAvatar profile={profile} />
          </div>
          <div>
            <p className="eyebrow">Your little corner</p>
            <h1>{user ? user.displayName || "Your profile" : "Hello, you."}</h1>
            <p>
              {user
                ? user.email
                : "You’re here as a guest. Make yourself at home."}
            </p>
          </div>
        </div>
        {user ? (
          <div className="profile-account-controls">
            <span className={`profile-sync ${sync}`} role="status">
              {sync === "saved"
                ? "Jar synced"
                : sync === "syncing"
                  ? "Syncing your jar…"
                  : "Saved on this device"}
            </span>
            <button className="quiet" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        ) : (
          <button
            className="google-signin"
            disabled={!ready || signingIn}
            onClick={() => void login()}
          >
            <GoogleMark />
            {!ready
              ? "Loading account…"
              : signingIn
                ? "Signing in…"
                : "Continue with Google"}
          </button>
        )}
        {error && (
          <div className="profile-error" role="alert">
            <p>{error}</p>
            {user && (
              <button className="quiet" onClick={retry}>
                Retry sync
              </button>
            )}
          </div>
        )}
      </section>
      <section
        className="listening-style"
        aria-labelledby="listening-style-title"
      >
        <h2 id="listening-style-title">Your listening style</h2>
        <p>A familiar voice. A pace that feels right.</p>
        <NarratorPicker
          value={preferences.narrator}
          onChange={(narrator) => update({ narrator })}
        />
        <div className="listening-controls">
          <div className="preference-row">
            <label htmlFor="preference-speed">Playback speed</label>
            <select
              id="preference-speed"
              value={String(preferences.speed)}
              onChange={(event) =>
                update({
                  speed: Number(event.target.value) as (typeof SPEEDS)[number],
                })
              }
            >
              {SPEEDS.map((speed) => (
                <option key={speed} value={String(speed)}>
                  {speed}×
                </option>
              ))}
            </select>
          </div>
          <label className="preference-row">
            <span>Keep listening between stories</span>
            <input
              type="checkbox"
              role="switch"
              aria-checked={preferences.autoplayNext}
              checked={preferences.autoplayNext}
              onChange={(event) =>
                update({ autoplayNext: event.target.checked })
              }
            />
          </label>
        </div>
      </section>
      <section
        className="profile-format"
        aria-labelledby="profile-format-title"
      >
        <h2 id="profile-format-title">How do you like to catch up?</h2>
        <div
          className="mode-picker"
          role="radiogroup"
          aria-label="How you catch up"
        >
          {(Object.keys(MODE_LABELS) as CatchUpMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={preferences.mode === mode}
              className={`mode-option${preferences.mode === mode ? " selected" : ""}`}
              onClick={() => update({ mode })}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </section>
      <div className="profile-library-links">
        <button onClick={onOpenJar}>
          Your jar <Icon name="next" size={16} />
        </button>
        {onReplayIntro && (
          <button onClick={onReplayIntro}>
            A little hello again <Icon name="next" size={16} />
          </button>
        )}
      </div>
      <details className="profile-data-note">
        <summary>Your progress & preferences</summary>
        <p>
          Finished editions and reactions{" "}
          {user ? "sync with your Google account" : "stay on this device"}.
          Voice, speed, Mini progress and listening preferences stay on this
          device. Your preferences never change the shared news edition.
        </p>
      </details>
    </section>
  );
}
