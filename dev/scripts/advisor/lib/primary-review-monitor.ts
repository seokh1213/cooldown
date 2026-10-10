export interface CommandReply {
  ok?: boolean;
  error?: { code?: string };
  result?: {
    send?: { accepted?: boolean };
    terminal?: { title?: string; connected?: boolean; writable?: boolean };
  };
}

export function terminalBelongsToReview(reply: CommandReply): boolean {
  const terminal = reply.result?.terminal;
  return reply.ok === true && terminal?.connected === true && terminal.writable === true
    && terminal.title?.includes("Cooldown 번역 직접 검수·모니터링") === true;
}

export function acceptedFollowup(reply: CommandReply): boolean {
  return reply.ok === true && reply.result?.send?.accepted === true;
}
