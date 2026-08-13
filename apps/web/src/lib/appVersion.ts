const deploymentVersionPattern = /^\d{4}\.\d{2}\.\d+$/u;

export function displayAppVersion(value: string | undefined): string {
  const version = value?.trim();
  return version && deploymentVersionPattern.test(version) ? version : "개발";
}

export const appVersion = displayAppVersion(import.meta.env.VITE_APP_VERSION);
