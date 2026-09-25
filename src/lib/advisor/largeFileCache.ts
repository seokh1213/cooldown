/**
 * 큰 모델 파일의 보조 저장소 — Cache Storage 가 받지 못한 파일을 OPFS(Origin Private File System)에 둔다
 *
 * transformers.js 는 받은 파일을 Cache Storage 에 넣는다. 그런데 550MB 짜리 가중치 한 덩어리를 넣다가
 * "Failed to execute 'put' on 'Cache': Unexpected internal error" 로 실패하는 브라우저가 있었다(여유 공간 6.7GB,
 * 200MB 는 들어가고 550MB 는 안 들어감). 실패하면 캐시 없이 넘어가서 **방문할 때마다 550MB 를 다시 받았다.**
 *
 * 그래서 실패한 파일만 OPFS 에 파일로 둔다. 파일 이름은 요청 주소를 그대로 부호화한 것이다(무엇인지 읽을 수 있게).
 * 쓰기는 워커에서만 한다(동기 접근 핸들). 읽기·목록·삭제는 어디서나 된다.
 */

const DIR = "transformers-large";

const nameOf = (url: string) => encodeURIComponent(url);
const urlOf = (name: string) => decodeURIComponent(name);

async function directory(create: boolean): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(DIR, { create });
  } catch {
    return undefined;
  }
}

/** 둔 파일이 있으면 응답으로 돌려준다. */
export async function readLargeFile(url: string): Promise<Response | undefined> {
  const dir = await directory(false);
  if (!dir) return undefined;
  try {
    const file = await (await dir.getFileHandle(nameOf(url))).getFile();
    if (!file.size) return undefined;
    return new Response(file, { headers: { "content-length": String(file.size) } });
  } catch {
    return undefined;
  }
}

/** 워커 전용. 끝까지 다 쓴 뒤에만 이름을 붙여 반쯤 쓴 파일이 남지 않게 한다. */
export async function writeLargeFile(url: string, bytes: Uint8Array): Promise<boolean> {
  const dir = await directory(true);
  if (!dir) return false;
  const temp = `${nameOf(url)}.part`;
  try {
    const handle = await dir.getFileHandle(temp, { create: true });
    const access = await (handle as FileSystemFileHandle & { createSyncAccessHandle: () => Promise<SyncAccess> }).createSyncAccessHandle();
    access.truncate(0);
    access.write(bytes, { at: 0 });
    access.flush();
    access.close();
    await (handle as FileSystemFileHandle & { move: (name: string) => Promise<void> }).move(nameOf(url));
    return true;
  } catch {
    await dir.removeEntry(temp).catch(() => undefined);
    return false;
  }
}

interface SyncAccess {
  truncate: (size: number) => void;
  write: (data: Uint8Array, options: { at: number }) => number;
  flush: () => void;
  close: () => void;
}

/** 둔 파일 목록(주소·크기). 모델 관리 화면이 용량을 잰다. */
export async function listLargeFiles(): Promise<Array<{ url: string; bytes: number }>> {
  const dir = await directory(false);
  if (!dir) return [];
  const out: Array<{ url: string; bytes: number }> = [];
  try {
    for await (const [name, handle] of (dir as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (handle.kind !== "file" || name.endsWith(".part")) continue;
      out.push({ url: urlOf(name), bytes: (await (handle as FileSystemFileHandle).getFile()).size });
    }
  } catch {
    // 목록을 못 읽으면 빈 것으로 본다
  }
  return out;
}

export async function deleteLargeFiles(): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(DIR, { recursive: true });
    return true;
  } catch {
    return false;
  }
}
