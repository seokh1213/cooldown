/// <reference lib="webworker" />
import type { AdvisorRequest, AdvisorResponse } from "@/features/advisor/contracts/protocol";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

export function post(message: AdvisorResponse, transfer: Transferable[] = []) {
  ctx.postMessage(message, transfer);
}

export function onRequest(handle: (request: AdvisorRequest) => void) {
  ctx.addEventListener("message", (event: MessageEvent<AdvisorRequest>) => handle(event.data));
}
