export async function loginWithMigratedPassword(auth, credentials, migrate) {
  let result = await auth.signInWithPassword(credentials);
  if (result.error?.code === 'invalid_credentials') {
    await migrate(credentials);
    result = await auth.signInWithPassword(credentials);
  }
  if (result.error) throw result.error;
  return result.data;
}
