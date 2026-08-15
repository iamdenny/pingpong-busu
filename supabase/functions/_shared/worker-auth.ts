const textEncoder = new TextEncoder();
const workerTokenPattern = /^[a-f0-9]{64}$/iu;

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", textEncoder.encode(value)),
  );
}

export async function hasValidWorkerAuthorization(
  request: Request,
  expectedToken: string | undefined,
): Promise<boolean> {
  if (!expectedToken || !workerTokenPattern.test(expectedToken)) return false;
  const match = /^Bearer ([^\s]+)$/u.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!match?.[1] || !workerTokenPattern.test(match[1])) return false;
  const [providedDigest, expectedDigest] = await Promise.all([
    digest(match[1]),
    digest(expectedToken),
  ]);
  let difference = providedDigest.length ^ expectedDigest.length;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= providedDigest[index] ^ expectedDigest[index];
  }
  return difference === 0;
}
