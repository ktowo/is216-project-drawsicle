// Deactivated and banned accounts have no public profile, so their names aren't links
export const linkableUser = (user) =>
  user && user.status && user.status !== 'active' ? { ...user, username: null } : user;
