import { createHash } from 'node:crypto';
import { chmodSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface UpdateManifest {
  applicationId: string;
  version: string;
  versionCode: number;
  signerSha256: string;
  apkSha256: string;
  releaseNotes: string;
  apkFilename: 'theory-exam.apk';
}

const hexDigest = /^[a-f0-9]{64}$/i;
const appIdPattern = /^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/;

function validManifest(parsed: Partial<UpdateManifest>): parsed is UpdateManifest {
  return parsed.apkFilename === 'theory-exam.apk' && Boolean(parsed.applicationId && appIdPattern.test(parsed.applicationId))
    && Boolean(parsed.version && parsed.version.length <= 64) && Number.isInteger(parsed.versionCode) && (parsed.versionCode ?? 0) >= 1
    && hexDigest.test(parsed.signerSha256 ?? '') && hexDigest.test(parsed.apkSha256 ?? '')
    && typeof parsed.releaseNotes === 'string' && parsed.releaseNotes.length <= 4000;
}

export function readCachedUpdate(cacheDirectory: string): { manifest: UpdateManifest; apkPath: string } | null {
  const manifestPath = join(cacheDirectory, 'latest.json');
  const apkPath = join(cacheDirectory, 'theory-exam.apk');
  if (!existsSync(manifestPath) || !existsSync(apkPath)) return null;
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as Partial<UpdateManifest>;
  if (!validManifest(parsed)) throw new Error('Update manifest is invalid.');
  const apkStat = statSync(apkPath);
  if (!apkStat.isFile()) throw new Error('Cached APK is not a regular file.');
  return { manifest: parsed as UpdateManifest, apkPath };
}

export async function verifyCachedApk(apkPath: string, expectedSha256: string): Promise<boolean> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(apkPath)) hash.update(chunk);
  return hash.digest('hex') === expectedSha256.toLowerCase();
}

/** Downloads only the two fixed assets from a configured private GitHub release. */
export async function syncLatestGithubRelease(options: {
  repository: string;
  token: string;
  cacheDirectory: string;
  releaseTag?: string;
  fetcher?: typeof fetch;
}): Promise<{ version: string; versionCode: number }> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository)) throw new Error('GitHub repository must be owner/name.');
  if (!options.token) throw new Error('GITHUB_TOKEN is required for private release sync.');
  const fetcher = options.fetcher ?? fetch;
  const base = `https://api.github.com/repos/${options.repository}`;
  const releaseUrl = options.releaseTag
    ? `${base}/releases/tags/${encodeURIComponent(options.releaseTag)}`
    : `${base}/releases/latest`;
  const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${options.token}`, 'x-github-api-version': '2022-11-28' };
  const releaseResponse = await fetcher(releaseUrl, { headers });
  if (!releaseResponse.ok) throw new Error(`Private GitHub release lookup failed (HTTP ${releaseResponse.status}).`);
  const release = await releaseResponse.json() as { assets?: Array<{ id?: number; name?: string; size?: number }> };
  const apkAssets = release.assets?.filter(asset => asset.name === 'theory-exam.apk') ?? [];
  const manifestAssets = release.assets?.filter(asset => asset.name === 'theory-exam-update.json') ?? [];
  if (apkAssets.length !== 1 || manifestAssets.length !== 1 || !Number.isInteger(apkAssets[0]?.id) || !Number.isInteger(manifestAssets[0]?.id)) {
    throw new Error('Latest release must contain exactly one APK and one update manifest asset.');
  }
  if ((apkAssets[0]?.size ?? 0) > 200 * 1024 * 1024 || (manifestAssets[0]?.size ?? 0) > 64 * 1024) throw new Error('Release asset exceeds the allowed size.');
  const downloadAsset = async (id: number) => {
    const response = await fetcher(`${base}/releases/assets/${id}`, { headers: { ...headers, accept: 'application/octet-stream' } });
    if (!response.ok) throw new Error(`Private release asset download failed (HTTP ${response.status}).`);
    return new Uint8Array(await response.arrayBuffer());
  };
  const [apkBytes, manifestBytes] = await Promise.all([downloadAsset(apkAssets[0]!.id!), downloadAsset(manifestAssets[0]!.id!)]);
  if (apkBytes.byteLength < 1 || apkBytes.byteLength > 200 * 1024 * 1024 || manifestBytes.byteLength > 64 * 1024) throw new Error('Downloaded release asset size is invalid.');
  let parsed: Partial<UpdateManifest>;
  try { parsed = JSON.parse(new TextDecoder().decode(manifestBytes)) as Partial<UpdateManifest>; }
  catch { throw new Error('Release update manifest is not valid JSON.'); }
  if (!validManifest(parsed)) throw new Error('Release update manifest is invalid.');
  const digest = createHash('sha256').update(apkBytes).digest('hex');
  if (digest !== parsed.apkSha256.toLowerCase()) throw new Error('Release APK SHA-256 does not match its manifest.');

  mkdirSync(options.cacheDirectory, { recursive: true, mode: 0o700 });
  chmodSync(options.cacheDirectory, 0o700);
  const apkNext = join(options.cacheDirectory, 'theory-exam.apk.next');
  const manifestNext = join(options.cacheDirectory, 'latest.json.next');
  const apkPath = join(options.cacheDirectory, 'theory-exam.apk');
  const manifestPath = join(options.cacheDirectory, 'latest.json');
  try {
    writeFileSync(apkNext, apkBytes, { mode: 0o600 });
    writeFileSync(manifestNext, JSON.stringify(parsed), { mode: 0o600 });
    renameSync(apkNext, apkPath);
    renameSync(manifestNext, manifestPath);
    chmodSync(apkPath, 0o600); chmodSync(manifestPath, 0o600);
  } finally {
    for (const path of [apkNext, manifestNext]) if (existsSync(path)) unlinkSync(path);
  }
  return { version: parsed.version, versionCode: parsed.versionCode };
}
