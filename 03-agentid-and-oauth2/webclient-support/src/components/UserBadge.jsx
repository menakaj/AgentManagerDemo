import { useAuthContext } from "@asgardeo/auth-react";

export default function UserBadge() {
  const { state, signOut } = useAuthContext();

  if (!state.isAuthenticated) return null;

  const label = state.displayName || state.username || "Signed in";

  return (
    <div className="user-badge">
      <span className="user-badge-name" title={state.username}>
        {label}
      </span>
      <button type="button" className="user-badge-signout" onClick={() => signOut()}>
        Sign out
      </button>
    </div>
  );
}
