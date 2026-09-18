export const asgardeoConfig = {
  baseUrl: import.meta.env.VITE_ASGARDEO_BASE_URL,
  clientID: import.meta.env.VITE_ASGARDEO_CLIENT_ID,
  signInRedirectURL: import.meta.env.VITE_ASGARDEO_SIGN_IN_REDIRECT_URL,
  signOutRedirectURL: import.meta.env.VITE_ASGARDEO_SIGN_OUT_REDIRECT_URL,
  scope: ["openid", "profile"],
};

export const isAsgardeoConfigured =
  Boolean(asgardeoConfig.baseUrl) &&
  Boolean(asgardeoConfig.clientID) &&
  !asgardeoConfig.baseUrl.includes("<") &&
  !asgardeoConfig.clientID.includes("<");

export const agentBaseUrl = import.meta.env.VITE_AGENT_BASE_URL || "http://localhost:8000";
