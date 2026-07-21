const DEVELOPMENT_SUFFIX = " Dev";

export function developmentUserDataPath(userDataPath: string): string {
  return userDataPath.endsWith(DEVELOPMENT_SUFFIX)
    ? userDataPath
    : `${userDataPath}${DEVELOPMENT_SUFFIX}`;
}
