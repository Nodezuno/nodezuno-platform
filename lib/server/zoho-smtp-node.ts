import { once } from "node:events";
import { Readable, Writable } from "node:stream";
import tls from "node:tls";
import {
  sendSmtpMessage,
  type SmtpMessage,
  type SmtpSocket,
} from "./zoho-smtp-protocol.ts";

export async function sendZohoSmtpMessage(options: {
  host: string;
  password: string;
  message: SmtpMessage;
}): Promise<string> {
  const socket = tls.connect({
    host: options.host,
    port: 465,
    servername: options.host,
    rejectUnauthorized: true,
  });
  const deadline = setTimeout(
    () => socket.destroy(new Error("smtp_timeout")),
    12_000,
  );
  try {
    await Promise.race([
      once(socket, "secureConnect"),
      once(socket, "error").then(([error]) => Promise.reject(error)),
    ]);
    const smtpSocket: SmtpSocket = {
      readable: Readable.toWeb(socket) as ReadableStream<Uint8Array>,
      writable: Writable.toWeb(socket) as WritableStream<Uint8Array>,
      close: () => {
        socket.destroy();
      },
    };
    return await sendSmtpMessage(smtpSocket, options.message, options.password);
  } catch (error) {
    socket.destroy();
    if (error instanceof Error) throw error;
    throw new Error("smtp_connection_failed");
  } finally {
    clearTimeout(deadline);
    socket.destroy();
  }
}
