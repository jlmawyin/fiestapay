export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
}

/**
 * `accepted` means the outbound SMTP server accepted the message for sending.
 * It is not inbox delivery and it says nothing about spam. `timeout` is ambiguous:
 * the message may or may not have left. `rejected` and `failed` did not succeed.
 */
export type EmailSendResult =
  | { status: 'accepted' }
  | { status: 'rejected' }
  | { status: 'timeout' }
  | { status: 'failed' };

export interface EmailAdapter {
  send(message: OutboundEmail): Promise<EmailSendResult>;
}
