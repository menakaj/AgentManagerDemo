import { useAuthContext } from "@asgardeo/auth-react";
import { isAsgardeoConfigured } from "../authConfig.js";

export default function SignInGate({ children }) {
  const { state, signIn } = useAuthContext();

  // Login is optional: when Asgardeo isn't configured, skip auth entirely
  // and let the console run unauthenticated (no Bearer token attached).
  if (!isAsgardeoConfigured) {
    return children;
  }

  if (state.isLoading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <span className="mark auth-mark">AB</span>
          <p className="hint">Checking your session&hellip;</p>
        </div>
      </div>
    );
  }

  if (!state.isAuthenticated) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <span className="mark auth-mark">AB</span>
          <h1>ACME Bank &mdash; Customer Support</h1>
          <p className="hint">Sign in with your ACME Bank account to chat with the Customer Support agent.</p>
          <button className="auth-signin" onClick={() => signIn()}>
            Sign in with Asgardeo
          </button>
        </div>
      </div>
    );
  }

  return children;
}
