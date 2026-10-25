import { readFileSync } from 'node:fs';
import { createTransport, type SMTPTransportOptions } from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, type EmailConfig } from '../src/config.js';
import { buildSmtpOptions, createSmtpEmail, type SmtpFactory, type SmtpMailer, type SmtpSendInfo } from '../src/email/smtp.js';

const PASS = 'smtp-test-pass';
const USER = 'fiesta-test@example.test';
const HOST = 'salida.example.test';

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    PUBLIC_ORIGIN: 'http://localhost:5173',
    SMTP_HOST: HOST,
    SMTP_PORT: '465',
    SMTP_USER: USER,
    SMTP_PASS: PASS,
    EMAIL_FROM: USER,
    ...overrides,
  };
}

function mailConfig(overrides: Record<string, string | undefined> = {}): EmailConfig {
  const config = loadConfig(env(overrides)).email;
  if (!config) throw new Error('se esperaba correo configurado');
  return config;
}

function capture(result: SmtpSendInfo | Error): { factory: SmtpFactory; options: SMTPTransportOptions[]; sent: unknown[] } {
  const options: SMTPTransportOptions[] = [];
  const sent: unknown[] = [];
  const factory: SmtpFactory = (built) => {
    options.push(built);
    const mailer: SmtpMailer = {
      async sendMail(message) {
        sent.push(message);
        if (result instanceof Error) throw result;
        return result;
      },
      close() {
        return undefined;
      },
    };
    return mailer;
  };
  return { factory, options, sent };
}

describe('SMTP Banahosting', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('arma 465 con TLS implicito y 587 con STARTTLS obligatorio', () => {
    const implicit = buildSmtpOptions(mailConfig());
    expect(implicit).toMatchObject({
      host: HOST,
      port: 465,
      secure: true,
      requireTLS: false,
      ignoreTLS: false,
      opportunisticTLS: false,
      forceAuth: true,
      logger: false,
      debug: false,
      transactionLog: false,
      pool: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(implicit.tls).toMatchObject({ rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: HOST });
    expect(implicit.auth).toEqual({ user: USER, pass: PASS });
    expect(implicit.url).toBeUndefined();

    const starttls = buildSmtpOptions(mailConfig({ SMTP_PORT: '587' }));
    expect(starttls).toMatchObject({
      port: 587,
      secure: false,
      requireTLS: true,
      ignoreTLS: false,
      opportunisticTLS: false,
    });
    expect(starttls.tls?.rejectUnauthorized).toBe(true);
  });

  it('Nodemailer conserva esas opciones y no abre una sesion al construir el transporte', () => {
    const logs: unknown[] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args) => logs.push(args));
    }
    const transport = createTransport(buildSmtpOptions(mailConfig({ SMTP_PORT: '587', SMTP_SECURE: 'false' })));
    try {
      expect(transport.options).toMatchObject({
        host: HOST,
        port: 587,
        secure: false,
        requireTLS: true,
        ignoreTLS: false,
        opportunisticTLS: false,
        disableFileAccess: true,
        disableUrlAccess: true,
        logger: false,
        debug: false,
      });
      expect(transport.options.tls?.rejectUnauthorized).toBe(true);
      expect(JSON.stringify(transport.options)).not.toContain('smtp://');
      expect(JSON.stringify(transport.options)).not.toContain('smtps://');
      expect(logs).toEqual([]);
    } finally {
      transport.close();
    }
  });

  it('rechaza puertos, hosts y buzones que no son el contrato, sin inventar un hostname', () => {
    expect(loadConfig(env({ SMTP_PORT: '25' })).email).toBeNull();
    expect(loadConfig(env({ SMTP_PORT: '2525' })).email).toBeNull();
    expect(loadConfig(env({ SMTP_PORT: '0465' })).email).toBeNull();
    expect(loadConfig(env({ SMTP_HOST: undefined })).email).toBeNull();
    expect(loadConfig(env({ SMTP_HOST: 'localhost' })).email).toBeNull();
    expect(loadConfig(env({ SMTP_HOST: '10.1.2.3' })).email).toBeNull();
    expect(loadConfig(env({ SMTP_HOST: 'http://salida.example.test' })).email).toBeNull();
    expect(loadConfig(env({ SMTP_HOST: 'solo' })).email).toBeNull();
    expect(loadConfig(env({ SMTP_USER: 'no-es-correo' })).email).toBeNull();
    expect(loadConfig(env({ SMTP_USER: 'Ana <ana@example.test>' })).email).toBeNull();
    expect(loadConfig(env({ EMAIL_FROM: 'a@example.test, b@example.test' })).email).toBeNull();
    expect(loadConfig(env({ SMTP_PASS: 'linea\npass' })).email).toBeNull();
    expect(loadConfig(env({ SMTP_PASS: '' })).email).toBeNull();

    const missing = loadConfig(env({ SMTP_PASS: undefined, SMTP_HOST: undefined }));
    expect(missing.email).toBeNull();
    expect(missing.emailDisabledReason).toContain('SMTP_HOST');
    expect(missing.emailDisabledReason).toContain('SMTP_PASS');
    expect(missing.emailDisabledReason).not.toContain(PASS);

    const invalid = loadConfig(env({ SMTP_PORT: '25', SMTP_PASS: PASS }));
    expect(invalid.emailDisabledReason).toBe('SMTP_PORT invalido');
    expect(invalid.emailDisabledReason).not.toContain(PASS);
    expect(invalid.emailDisabledReason).not.toContain(HOST);
  });

  it('acota tiempos y el vencimiento del token, e ignora banderas que aflojarian TLS', () => {
    expect(mailConfig({ EMAIL_TIMEOUT_MS: '999999' }).timeoutMs).toBe(20_000);
    expect(mailConfig({ EMAIL_TIMEOUT_MS: '5' }).timeoutMs).toBe(1_000);
    expect(mailConfig({ EMAIL_TOKEN_TTL_SECONDS: '99999' }).tokenTtlSeconds).toBe(900);
    const forced = buildSmtpOptions(mailConfig({ SMTP_PORT: '465', SMTP_SECURE: 'false', NODE_TLS_REJECT_UNAUTHORIZED: '0' }));
    expect(forced.secure).toBe(true);
    expect(forced.tls?.rejectUnauthorized).toBe(true);
    for (const name of ['connectionTimeout', 'greetingTimeout', 'socketTimeout', 'dnsTimeout'] as const) {
      expect(forced[name]).toBe(forced.connectionTimeout);
      expect(forced[name]).toBeGreaterThan(0);
      expect(forced[name]).toBeLessThanOrEqual(20_000);
    }
  });

  it('no deja rastros de Cloudflare ni apaga la validacion del certificado', () => {
    const smtp = readFileSync(new URL('../src/email/smtp.ts', import.meta.url), 'utf8');
    const config = readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8');
    expect(smtp + config).not.toMatch(/cloudflare/i);
    expect(smtp + config).not.toContain('mail.somospanas.com');
    expect(smtp + config).not.toMatch(/rejectUnauthorized:\s*false/);
  });

  it('acepta solo el unico destinatario y trata un rechazo parcial como rechazo', async () => {
    const to = 'persona@example.test';
    const accepted = capture({ accepted: [to], rejected: [], pending: [] });
    expect(await createSmtpEmail(mailConfig(), accepted.factory).send({ to, subject: 'Hola', text: 'cuerpo' })).toEqual({ status: 'accepted' });
    expect(accepted.options[0]).toMatchObject({ host: HOST, port: 465, secure: true, requireTLS: false, logger: false, debug: false });
    expect(accepted.sent).toEqual([
      { from: USER, to, subject: 'Hola', text: 'cuerpo', disableFileAccess: true, disableUrlAccess: true },
    ]);

    const partial = capture({ accepted: [to], rejected: [to] });
    expect(await createSmtpEmail(mailConfig(), partial.factory).send({ to, subject: 'Hola', text: 'cuerpo' })).toEqual({ status: 'rejected' });

    const extra = capture({ accepted: [to, 'otro@example.test'], rejected: [] });
    expect(await createSmtpEmail(mailConfig(), extra.factory).send({ to, subject: 'Hola', text: 'cuerpo' })).toEqual({ status: 'failed' });

    const pending = capture({ accepted: [], rejected: [], pending: [to] });
    expect(await createSmtpEmail(mailConfig(), pending.factory).send({ to, subject: 'Hola', text: 'cuerpo' })).toEqual({ status: 'failed' });

    const shaped = capture({ accepted: [{ address: ` ${to} ` }], rejected: [] });
    expect(await createSmtpEmail(mailConfig(), shaped.factory).send({ to, subject: 'Hola', text: 'cuerpo' })).toEqual({ status: 'accepted' });
  });

  it('no llama al transporte con un mensaje invalido', async () => {
    const seen = capture({ accepted: [USER], rejected: [] });
    const adapter = createSmtpEmail(mailConfig(), seen.factory);
    expect(await adapter.send({ to: USER, subject: 'linea\nAsunto', text: 'cuerpo' })).toEqual({ status: 'failed' });
    expect(await adapter.send({ to: 'no-correo', subject: 'Asunto', text: 'cuerpo' })).toEqual({ status: 'failed' });
    expect(seen.options).toEqual([]);
  });

  it('clasifica auth y timeout sin devolver credenciales, cuerpo ni respuesta SMTP', async () => {
    const logs: unknown[] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args) => logs.push(args));
    }
    const body = `token secreto ${PASS} y el cuerpo`;
    const auth = new Error(`535 ${PASS} AUTH PLAIN ${body}`);
    (auth as { code?: string; response?: string; command?: string; responseCode?: number }).code = 'EAUTH';
    (auth as { response?: string }).response = `535 ${PASS}`;
    (auth as { command?: string }).command = 'AUTH PLAIN';
    (auth as { responseCode?: number }).responseCode = 535;
    const authSend = capture(auth);
    const authResult = await createSmtpEmail(mailConfig(), authSend.factory).send({ to: USER, subject: 'Hola', text: body });
    expect(authResult).toEqual({ status: 'failed' });
    expect(JSON.stringify(authResult)).not.toContain(PASS);
    expect(JSON.stringify(authResult)).not.toContain(body);

    const timeout = new Error(`timeout ${PASS} ${body}`);
    (timeout as { code?: string; timeoutType?: string }).code = 'ETIMEDOUT';
    (timeout as { timeoutType?: string }).timeoutType = 'GREETING_TIMEOUT';
    const timeoutResult = await createSmtpEmail(mailConfig(), capture(timeout).factory).send({ to: USER, subject: 'Hola', text: body });
    expect(timeoutResult).toEqual({ status: 'timeout' });
    expect(JSON.stringify(timeoutResult)).not.toContain(PASS);

    const rejected = new Error(`550 ${PASS}`);
    (rejected as { code?: string; responseCode?: number; rejected?: string[] }).code = 'EENVELOPE';
    (rejected as { responseCode?: number }).responseCode = 550;
    (rejected as { rejected?: string[] }).rejected = [USER];
    expect(await createSmtpEmail(mailConfig(), capture(rejected).factory).send({ to: USER, subject: 'Hola', text: body })).toEqual({
      status: 'rejected',
    });

    const dns = new Error(`dns ${PASS}`);
    (dns as { code?: string }).code = 'EDNS';
    expect(await createSmtpEmail(mailConfig(), capture(dns).factory).send({ to: USER, subject: 'Hola', text: body })).toEqual({ status: 'failed' });
    expect(logs).toEqual([]);
  });
});
