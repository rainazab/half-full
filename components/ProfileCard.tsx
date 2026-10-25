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
    <section className="profile-card" aria-label="Your profile">
      {user ? (
        <>
          <div className="profile-identity">
            <div className="profile-avatar">
              <ProfileAvatar profile={profile} />
            </div>
            <div>
              <h2>{user.displayName || "Your profile"}</h2>
              <p>{user.email}</p>
            </div>
          </div>
          <div className="profile-actions">
            <span className={`profile-sync ${sync}`} role="status">
              {sync === "saved"
                ? "Jar synced"
                : sync === "syncing"
                  ? "Syncing…"
                  : "Changes saved on this device"}
            </span>
            <button className="quiet" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </>
      ) : (
        <div className="profile-signin">
          <div>
            <h2>Your jar, anywhere.</h2>
            <p>Sign in to keep your progress across devices.</p>
          </div>
          <button
            className="google-signin"
            disabled={!ready || signingIn}
            onClick={() => void login()}
          >
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
            {!ready
              ? "Loading account…"
              : signingIn
                ? "Signing in…"
                : "Continue with Google"}
          </button>
        </div>
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
