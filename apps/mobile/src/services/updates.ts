import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { getActiveExam } from './exams';
import { apiDownload, apiRequest } from './api';

export interface UpdateManifest {
  applicationId: string;
  version: string;
  versionCode: number;
  signerSha256: string;
  apkSha256: string;
  releaseNotes: string;
  apkFilename: 'theory-exam.apk';
}

export interface CheckedUpdate {
  currentVersion: string;
  manifest: UpdateManifest;
  available: boolean;
}

export async function checkForUpdate(): Promise<CheckedUpdate> {
  if (!Capacitor.isNativePlatform()) throw new Error('版本检查仅在 Android APP 中可用。');
  const [current, latest] = await Promise.all([
    App.getInfo(),
    apiRequest<UpdateManifest>('/api/updates/latest'),
  ]);
  if (current.id !== latest.applicationId) throw new Error('更新包的应用标识与当前安装 APP 不一致。');
  const currentCode = Number(current.build);
  if (!Number.isInteger(currentCode) || currentCode < 0) throw new Error('无法读取当前 APP 版本号。');
  return { currentVersion: current.version, manifest: latest, available: latest.versionCode > currentCode };
}

export async function downloadAndOpenUpdate(
  update: UpdateManifest,
  onProgress: (received: number, total: number | null) => void,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) throw new Error('APK 安装仅支持 Android APP。');
  const app = await App.getInfo();
  if (app.id !== update.applicationId || Number(update.versionCode) <= Number(app.build)) {
    throw new Error('更新包身份或版本校验失败。');
  }
  const bytes = await apiDownload('/api/updates/apk', onProgress);
  const digestInput = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(digestInput).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', digestInput);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (sha256.toLowerCase() !== update.apkSha256.toLowerCase()) throw new Error('APK SHA-256 校验失败，已拒绝安装。');

  const active = await getActiveExam();
  if (active.session?.status === 'in_progress') throw new Error('检测到正在进行的模拟考试。更新包已下载，但考试结束前不会打开安装器。');

  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  const saved = await Filesystem.writeFile({ path: 'updates/theory-exam-update.apk', directory: Directory.Cache, data: btoa(binary), recursive: true });
  // Android's Package Installer verifies the APK signer against the installed app before accepting an update.
  await FileOpener.open({ filePath: saved.uri, contentType: 'application/vnd.android.package-archive', openWithDefault: true });
}
