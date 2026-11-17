import { connect } from "cloudflare:sockets";
import {
  SmtpDeliveryError,
  sendSmtpMessage,
  type SmtpMessage,
  type SmtpSocket,
} from "./zoho-smtp-protocol.ts";

export async function sendZohoSmtpMessage(options: {
  host: string;
  password: string;
  message: SmtpMessage;
}): Promise<string> {
  const socket = connect(
    { hostname: options.host, port: 465 },
    { secureTransport: "on" },
  );
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    void socket.close().catch(() => undefined);
  }, 12_000);
  try {
    await socket.opened;
    return await sendSmtpMessage(
      socket as SmtpSocket,
      options.message,
      options.password,
    );
  } catch (error) {
    if (
      timedOut &&
      !(error instanceof SmtpDeliveryError && error.permanent)
    ) {
      throw new Error("smtp_timeout");
    }
    if (error instanceof Error) throw error;
    throw new Error("smtp_connection_failed");
  } finally {
    clearTimeout(deadline);
    await socket.close().catch(() => undefined);
  }
}
