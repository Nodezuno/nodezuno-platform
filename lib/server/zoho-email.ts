import {
  isContainerRuntime,
  optionalEmailDeliveryConfigurationIsValid,
  runtimeEnvironmentValue,
} from "./runtime-config.ts";
import {
  NODEZUNO_EMAIL_ADDRESS,
  type SmtpMessage,
} from "./zoho-smtp-protocol.ts";

export type NodezunoEmail = Omit<SmtpMessage, "messageId"> & {
  messageId: string;
};

export async function sendNodezunoEmail(
  message: NodezunoEmail,
): Promise<string> {
  const [host, password] = await Promise.all([
    runtimeEnvironmentValue("ZOHO_SMTP_HOST"),
    runtimeEnvironmentValue("ZOHO_SMTP_PASSWORD"),
  ]);
  if (!isZohoEmailDeliveryConfigured(password, host)) {
    throw Object.assign(new Error("email_delivery_not_configured"), {
      code: "email_delivery_not_configured",
      permanent: true,
    });
  }
  const options = { host: host!, password: password!, message };
  const transport = isContainerRuntime()
    ? await import("./zoho-smtp-node.ts")
    : await import("./zoho-smtp-cloudflare.ts");
  return transport.sendZohoSmtpMessage(options);
}

export function isZohoEmailDeliveryConfigurationValid(
  password: string | undefined,
  host: string | undefined,
): boolean {
  return optionalEmailDeliveryConfigurationIsValid(password, host);
}

export function isZohoEmailDeliveryConfigured(
  password: string | undefined,
  host: string | undefined,
): boolean {
  return Boolean(
    password &&
      host &&
      isZohoEmailDeliveryConfigurationValid(password, host),
  );
}

export { NODEZUNO_EMAIL_ADDRESS };
