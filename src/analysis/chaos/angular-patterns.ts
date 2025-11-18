/**
 * Angular-specific pattern detection utilities (Simplified)
 */

export function isStateIdentifier(name: string): boolean {
  const lowerName = name.toLowerCase();
  const stateKeywords = [
    "state",
    "config",
    "context",
    "data",
    "token",
    "user",
    "auth",
    "session",
    "settings",
    "cache",
    "store",
    "value",
    "status",
    "flag",
    "id",
  ];

  if (stateKeywords.some((keyword) => lowerName.includes(keyword))) {
    return true;
  }

  // Common patterns
  const patterns = [
    /^_[a-z]+$/, // _token
    /^is[A-Z]/, // isLoading
    /^has[A-Z]/, // hasToken
    /[Ss]tate$/, // userState
    /[Cc]onfig$/, // apiConfig
    /Subject$/, // userSubject
  ];

  return patterns.some((pattern) => pattern.test(name));
}
