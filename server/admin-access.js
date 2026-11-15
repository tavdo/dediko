export async function hasAdminAccess() {
  // The management console now uses its own single username/session. A member
  // account or a legacy email grant does not authorize console requests.
  return false;
}
