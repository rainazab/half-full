"use client";
import type useProfile from "@/hooks/useProfile";
export type ProfileState = ReturnType<typeof useProfile>;
export function ProfileAvatar({ profile }: { profile: ProfileState }) {
  return profile.user?.photoURL ? (
    <img
      src={profile.user.photoURL}
      alt=""
      referrerPolicy="no-referrer"
      width={42}
      height={42}
    />
  ) : (
    <span aria-hidden="true">
      {profile.user?.displayName?.trim().charAt(0).toUpperCase() || "◡"}
    </span>
  );
}
export default function ProfileCard({ profile }: { profile: ProfileState }) {
  const { user, ready, signingIn, sync, error, login, logout, retry } = profile;
  return (
    <section className="profile-inline-account" aria-label="Your profile">
      {user ? (
        <>
          <h2>{user.displayName || "Your profile"}</h2>
          <div className="profile-account-controls">
            <span className={`profile-sync ${sync}`} role="status">
              {sync === "saved"
                ? "Jar synced"
                : sync === "syncing"
                  ? "Syncing…"
                  : "Saved on this device"}
            </span>
            <button className="quiet" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </>
      ) : (
        <>
          <h2>Your jar, wherever you are.</h2>
          <p>Sign in to bring your progress along.</p>
          <button
            className="google-signin"
            disabled={!ready || signingIn}
            onClick={() => void login()}
          >
            {!ready
              ? "Loading account…"
              : signingIn
                ? "Signing in…"
                : "Continue with Google"}
          </button>
        </>
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
  );
}
