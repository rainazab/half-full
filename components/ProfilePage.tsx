"use client";
import type { ProfileState } from "./ProfileCard";
import { ProfileAvatar } from "./ProfileCard";
import NarratorPicker from "./NarratorPicker";
import type { PreferencesState } from "@/hooks/usePreferences";
import { SPEEDS } from "@/lib/preferences";

function GoogleMark() {
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

/** Account management and listening preferences. Reading history lives in Your jar. */
export default function ProfilePage({
  profile,
  settings,
  onOpenJar,
}: {
  profile: ProfileState;
  settings: PreferencesState;
  onOpenJar: () => void;
}) {
  const { user, ready, signingIn, sync, error, login, logout, retry } = profile;
  const { preferences, update } = settings;
  return (
    <section className="profile-page" aria-label="Profile">
      <div className="page-heading">
        <h1>Profile</h1>
      </div>
      <section className="profile-identity-block" aria-label="Account">
        <div className="profile-identity">
          <div className="profile-avatar">
            <ProfileAvatar profile={profile} />
          </div>
          <div>
            <h2>
              {user ? user.displayName || "Your account" : "Reading as a guest"}
            </h2>
            <p>
              {user
                ? user.email
                : "Your progress stays on this device until you sign in."}
            </p>
          </div>
        </div>
        {user ? (
          <div className="profile-actions">
            <span className={`profile-sync ${sync}`} role="status">
              {sync === "saved"
                ? "Reads and reactions synced"
                : sync === "syncing"
                  ? "Syncing…"
                  : sync === "error"
                    ? "Saved on this device"
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
      <section className="preference-block" aria-labelledby="narrator-heading">
        <h2 id="narrator-heading">Narrator</h2>
        <p className="preference-note">
          Who reads the stories aloud. Applies to the next clip you play.
        </p>
        <NarratorPicker
          value={preferences.narrator}
          onChange={(narrator) => update({ narrator })}
        />
      </section>
      <section className="preference-block" aria-labelledby="listening-heading">
        <h2 id="listening-heading">Listening</h2>
        <div className="preference-row">
          <label htmlFor="preference-speed">Speed</label>
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
          <span>Autoplay the next story</span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={preferences.autoplayNext}
            checked={preferences.autoplayNext}
            onChange={(event) => update({ autoplayNext: event.target.checked })}
          />
        </label>
      </section>
      <section className="preference-block" aria-labelledby="data-heading">
        <h2 id="data-heading">Your data</h2>
        <p className="preference-note">
          Completed editions and reactions{" "}
          {user ? "sync through your Google account" : "stay on this device"}.
          Narrator and listening preferences stay on this device. Reactions are
          private and never change which stories everyone sees.
        </p>
        <button className="quiet link-like" onClick={onOpenJar}>
          Open Your jar ↗
        </button>
      </section>
    </section>
  );
}
