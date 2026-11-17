export type SmtpMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
  listUnsubscribe?: string;
};

export type SmtpSocket = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): void | Promise<void>;
};

export class SmtpDeliveryError extends Error {
  readonly code: string;
  readonly permanent: boolean;
  readonly retryAfterMs?: number;

  constructor(
    code: string,
    options: { permanent?: boolean; retryAfterMs?: number } = {},
  ) {
    super(code);
    this.name = "SmtpDeliveryError";
    this.code = code;
    this.permanent = options.permanent ?? false;
    this.retryAfterMs = options.retryAfterMs;
  }
}

const encoder = new TextEncoder();

export async function sendSmtpMessage(
  socket: SmtpSocket,
  message: SmtpMessage,
  password: string,
): Promise<string> {
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  let buffered = "";
  let contentSubmitted = false;

  const readLine = async (): Promise<string> => {
    while (true) {
      const lineEnd = buffered.indexOf("\r\n");
      if (lineEnd >= 0) {
        const line = buffered.slice(0, lineEnd);
        buffered = buffered.slice(lineEnd + 2);
        if (line.length > 4096) {
          throw new SmtpDeliveryError("smtp_response_too_large", {
            permanent: true,
          });
        }
        return line;
      }
      if (buffered.length > 16_384) {
        throw new SmtpDeliveryError("smtp_response_too_large", {
          permanent: true,
        });
      }
      const next = await reader.read();
      if (next.done) throw new Error("smtp_connection_closed");
      buffered += new TextDecoder().decode(next.value, { stream: true });
    }
  };

  const readReply = async (): Promise<{ code: number; lines: string[] }> => {
    const lines: string[] = [];
    let code: number | null = null;
    while (lines.length < 100) {
      const line = await readLine();
      const match = /^(\d{3})([ -])(.*)$/.exec(line);
      if (!match) {
        throw new SmtpDeliveryError("smtp_protocol_error", {
          permanent: true,
        });
      }
      const currentCode = Number(match[1]);
      if (code === null) code = currentCode;
      if (currentCode !== code) {
        throw new SmtpDeliveryError("smtp_protocol_error", {
          permanent: true,
        });
      }
      lines.push(line);
      if (match[2] === " ") return { code, lines };
    }
    throw new SmtpDeliveryError("smtp_response_too_large", {
      permanent: true,
    });
  };

  const writeLine = async (line: string): Promise<void> => {
    if (/[\r\n\u0000]/.test(line) || encoder.encode(line).byteLength > 500) {
      throw new SmtpDeliveryError("smtp_command_invalid", { permanent: true });
    }
    await writer.write(encoder.encode(`${line}\r\n`));
  };

  const expect = async (acceptedCodes: number[]): Promise<number> => {
    const reply = await readReply();
    if (acceptedCodes.includes(reply.code)) return reply.code;
    if (reply.code >= 400 && reply.code < 500) {
      throw new SmtpDeliveryError("smtp_temporary_rejection", {
        retryAfterMs: retryDelayFromReply(reply.lines),
      });
    }
    throw new SmtpDeliveryError("smtp_rejected", { permanent: true });
  };

  const command = async (
    value: string,
    acceptedCodes: number[],
  ): Promise<number> => {
    await writeLine(value);
    return expect(acceptedCodes);
  };

  try {
    await expect([220]);
    await command("EHLO nodezuno.com", [250]);
    await command("AUTH LOGIN", [334]);
    await writeLine(encodeBase64(NODEZUNO_EMAIL_ADDRESS));
    await expect([334]);
    await writeLine(encodeBase64(password));
    await expect([235]);
    await command(`MAIL FROM:<${NODEZUNO_EMAIL_ADDRESS}>`, [250]);
    await command(`RCPT TO:<${validateMailbox(message.to)}>`, [250, 251]);
    await command("DATA", [354]);
    contentSubmitted = true;
    await writer.write(encoder.encode(`${formatMessage(message)}\r\n.\r\n`));
    await expect([250]);
    try {
      await writeLine("QUIT");
    } catch {
      // The SMTP server has already accepted the message.
    }
    return `<${message.messageId}@nodezuno.com>`;
  } catch (error) {
    if (contentSubmitted && !(error instanceof SmtpDeliveryError)) {
      throw new SmtpDeliveryError("smtp_delivery_outcome_unknown", {
        permanent: true,
      });
    }
    throw error;
  } finally {
    reader.releaseLock();
    writer.releaseLock();
  }
}

export const NODEZUNO_EMAIL_ADDRESS = "info@nodezuno.com";
export const NODEZUNO_EMAIL_FROM = `Nodezuno <${NODEZUNO_EMAIL_ADDRESS}>`;

function validateMailbox(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized !== value ||
    normalized.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      normalized,
    )
  ) {
    throw new SmtpDeliveryError("recipient_invalid", { permanent: true });
  }
  return normalized;
}

function formatMessage(message: SmtpMessage): string {
  const recipient = validateMailbox(message.to);
  const subject = safeHeader(message.subject, 200);
  const messageId = safeMessageId(message.messageId);
  const boundary = `nodezuno-${messageId.slice(9, 41)}`;
  const headers = [
    `From: ${NODEZUNO_EMAIL_FROM}`,
    `To: ${recipient}`,
    `Subject: =?UTF-8?B?${encodeBase64(subject)}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}@nodezuno.com>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
  ];
  if (message.listUnsubscribe) {
    let unsubscribeUrl: URL;
    try {
      unsubscribeUrl = new URL(message.listUnsubscribe);
    } catch {
      throw new SmtpDeliveryError("unsubscribe_url_invalid", {
        permanent: true,
      });
    }
    if (unsubscribeUrl.protocol !== "https:") {
      throw new SmtpDeliveryError("unsubscribe_url_invalid", {
        permanent: true,
      });
    }
    headers.push(`List-Unsubscribe: <${unsubscribeUrl.toString()}>`);
    headers.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  }
  const text = encodeBase64(safeBody(message.text));
  const html = encodeBase64(safeBody(message.html));
  return [
    ...headers,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(html),
    `--${boundary}--`,
  ].join("\r\n");
}

function safeHeader(value: string, maximum: number): string {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
  if (!normalized) {
    throw new SmtpDeliveryError("subject_invalid", { permanent: true });
  }
  return normalized;
}

function safeBody(value: string): string {
  if (value.length > 256_000 || /\u0000/.test(value)) {
    throw new SmtpDeliveryError("message_invalid", { permanent: true });
  }
  return value.replace(/\r\n|\r|\n/g, "\r\n");
}

function safeMessageId(value: string): string {
  if (!/^nodezuno-[a-f0-9-]{32,80}$/.test(value)) {
    throw new SmtpDeliveryError("message_id_invalid", { permanent: true });
  }
  return value;
}

function encodeBase64(value: string): string {
  const bytes = encoder.encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function retryDelayFromReply(lines: string[]): number | undefined {
  const seconds = lines
    .map((line) => /retry-after[=: ]+(\d{1,5})/i.exec(line)?.[1])
    .find((value) => value !== undefined);
  return seconds ? Math.min(Number(seconds) * 1000, 60 * 60_000) : undefined;
}
