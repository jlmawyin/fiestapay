import { createTransport, type SendMailOptions, type SMTPTransportOptions } from 'nodemailer';
import type { EmailConfig } from '../config.js';
import { normalizeMailbox } from './address.js';
import type { EmailAdapter, EmailSendResult, OutboundEmail } from './types.js';

/** Codes this adapter is willing to read. Anything else, including messages and replies, is ignored. */
const SAFE_CODES = new Set([
  'ECONNECTION',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'ETLS',
  'EREQUIRETLS',
  'EPROTOCOL',
  'EENVELOPE',
  'EMESSAGE',
  'ESTREAM',
  'EAUTH',
  'ENOAUTH',
  'EOAUTH2',
  'ECONFIG',
  'EFILEACCESS',
  'EURLACCESS',
  'EFETCH',
  'EMAXRECIPIENTS',
]);

const AUTH_CODES = new Set(['EAUTH', 'ENOAUTH', 'EOAUTH2']);
const TIMEOUT_TYPES = new Set(['CONNECT_TIMEOUT', 'GREETING_TIMEOUT', 'UPGRADE_TIMEOUT', 'SOCKET_TIMEOUT']);

export interface SmtpSendInfo {
  accepted?: unknown;
  rejected?: unknown;
  pending?: unknown;
}

export interface SmtpMailer {
  sendMail(message: SendMailOptions): Promise<SmtpSendInfo>;
  close?: () => void;
}

export type SmtpFactory = (options: SMTPTransportOptions) => SmtpMailer;

/**
 * Nodemailer SMTP options for the two allowed cPanel modes.
 * 465 uses implicit TLS. 587 uses STARTTLS and refuses to continue in clear.
 * The hostname is the one in SMTP_HOST. This function does not invent one.
 * https://nodemailer.com/smtp
 */
export function buildSmtpOptions(config: EmailConfig): SMTPTransportOptions {
  const implicitTls = config.port === 465;
  return {
    host: config.host,
    port: config.port,
    secure: implicitTls,
    requireTLS: !implicitTls,
    ignoreTLS: false,
    opportunisticTLS: false,
    forceAuth: true,
    auth: { user: config.user, pass: config.pass },
    logger: false,
    debug: false,
    transactionLog: false,
    pool: false,
    disableFileAccess: true,
    disableUrlAccess: true,
    connectionTimeout: config.timeoutMs,
    greetingTimeout: config.timeoutMs,
    socketTimeout: config.timeoutMs,
    dnsTimeout: config.timeoutMs,
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      servername: config.host,
    },
  };
}

function defaultFactory(options: SMTPTransportOptions): SmtpMailer {
  const transport = createTransport(options);
  return {
    sendMail: (message) => transport.sendMail(message),
    close: () => transport.close(),
  };
}

function addresses(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const raw = typeof item === 'string' ? item : item && typeof item === 'object' && 'address' in item ? (item as { address?: unknown }).address : null;
    if (typeof raw !== 'string') continue;
    const mailbox = normalizeMailbox(raw);
    if (mailbox) out.push(mailbox);
  }
  return out;
}

function safeCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && SAFE_CODES.has(code) ? code : null;
}

function statusFromError(err: unknown, to: string): EmailSendResult {
  const code = safeCode(err);
  if (code && AUTH_CODES.has(code)) return { status: 'failed' };
  const timeoutType = err && typeof err === 'object' ? (err as { timeoutType?: unknown }).timeoutType : null;
  if (code === 'ETIMEDOUT' || (typeof timeoutType === 'string' && TIMEOUT_TYPES.has(timeoutType))) return { status: 'timeout' };
  const rejected = addresses(err && typeof err === 'object' ? (err as { rejected?: unknown }).rejected : null);
  const responseCode = err && typeof err === 'object' ? (err as { responseCode?: unknown }).responseCode : null;
  const permanent =
    typeof responseCode === 'number' && Number.isInteger(responseCode) && responseCode >= 500 && responseCode <= 599 && responseCode !== 503;
  if (rejected.includes(to) || (permanent && (code === 'EENVELOPE' || code === 'EMESSAGE'))) return { status: 'rejected' };
  return { status: 'failed' };
}

/** Accepted only when this one recipient is the entire accepted list and nothing was rejected or left pending. */
function classify(to: string, info: SmtpSendInfo): EmailSendResult {
  const accepted = addresses(info.accepted);
  const rejected = addresses(info.rejected);
  const pending = addresses(info.pending);
  if (rejected.includes(to)) return { status: 'rejected' };
  if (accepted.length === 1 && accepted[0] === to && rejected.length === 0 && pending.length === 0) return { status: 'accepted' };
  return { status: 'failed' };
}

function messageOk(message: OutboundEmail): boolean {
  if (/[\r\n\0]/.test(message.subject) || message.subject.trim().length === 0 || message.subject.length > 200) return false;
  if (message.text.length === 0 || message.text.length > 20_000 || message.text.includes('\0')) return false;
  return true;
}

/**
 * Sends one plain-text message through the installed Nodemailer SMTP transport.
 * `sendMail` acceptance is queued by the outbound server, never proof of inbox delivery.
 * Tests pass a factory. The default factory is the only production transport.
 */
export function createSmtpEmail(config: EmailConfig, factory: SmtpFactory = defaultFactory): EmailAdapter {
  return {
    async send(message: OutboundEmail): Promise<EmailSendResult> {
      const to = normalizeMailbox(message.to);
      const from = normalizeMailbox(config.from);
      if (!to || !from || !messageOk(message)) return { status: 'failed' };
      const payload: SendMailOptions = {
        from,
        to,
        subject: message.subject,
        text: message.text,
        disableFileAccess: true,
        disableUrlAccess: true,
      };
      let mailer: SmtpMailer | null = null;
      try {
        mailer = factory(buildSmtpOptions(config));
        const info = await mailer.sendMail(payload);
        return classify(to, info ?? {});
      } catch (err) {
        return statusFromError(err, to);
      } finally {
        try {
          mailer?.close?.();
        } catch {
          // A close failure must not replace the send result or reveal the socket error.
        }
      }
    },
  };
}
