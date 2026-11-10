import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  SERVER_ERROR_EN,
  SERVER_ERROR_PATTERNS_EN,
  genericServerErrorEn,
  translateServerError,
} from '@fiestapay/shared';

const API_SRC = fileURLToPath(new URL('../src', import.meta.url));

const ERROR_HELPERS = new Set([
  'badRequest',
  'unauthorized',
  'forbidden',
  'notFound',
  'conflict',
  'gone',
  'unavailable',
  'badGateway',
  'retry',
  // paypal/verify.ts builds a VerifyFailure reason with these two factories.
  'permanent',
  'pending',
]);

const MESSAGE_CONSTANT = /(_MESSAGE$|^(CAPTURE_IN_FLIGHT|RECOVERY_LIMIT|RECOVERY_UNAVAILABLE|PUBLIC_CHAT_UNAVAILABLE|ACTIVE_LEASE|RATE_LIMIT|DAILY_LIMIT|NO_ANSWER|UNREADABLE|FAILED)$)/;

/** Literal `reason` values that never reach a client as text. */
const NON_MESSAGE_REASONS = new Set([
  'client',
  'expired',
  'idle',
  'weather',
  'homework',
  'other-app',
  'sports',
  'personal-mail',
  'restaurants',
]);

/**
 * parseOr400 builds `field: <zod message>` from runtime values. The prefix is covered by a
 * pattern and exercised by an explicit test below; the other zod messages in that file are
 * literals and are still scanned.
 */
const DYNAMIC_EXEMPT_FILES = new Set(['lib/schemas.ts']);

interface Found {
  file: string;
  line: number;
  message: string;
  dynamic: boolean;
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      files.push(...(await sourceFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

function literalOf(expression: ts.Expression | undefined): { message: string; dynamic: boolean } | null {
  if (!expression) return null;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return { message: expression.text, dynamic: false };
  }
  if (ts.isTemplateExpression(expression)) {
    let message = expression.head.text;
    for (const span of expression.templateSpans) message += `1${span.literal.text}`;
    return { message, dynamic: true };
  }
  return null;
}

function literalsInside(expression: ts.Expression | undefined): { message: string; dynamic: boolean }[] {
  const direct = literalOf(expression);
  if (direct) return [direct];
  if (!expression) return [];
  const found: Found[] = [];
  const visit = (node: ts.Node): void => {
    const literal = literalOf(node as ts.Expression);
    if (literal) {
      found.push({ file: '', line: 0, ...literal });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found.map(({ message, dynamic }) => ({ message, dynamic }));
}

function collect(source: string, absoluteFile: string): Found[] {
  const file = relative(API_SRC, absoluteFile).replaceAll('\\', '/');
  const text = ts.createSourceFile(absoluteFile, source, ts.ScriptTarget.ES2022, true);
  const found: Found[] = [];

  const push = (node: ts.Node, literal: { message: string; dynamic: boolean } | null): void => {
    if (!literal) return;
    const line = text.getLineAndCharacterOfPosition(node.getStart(text)).line + 1;
    found.push({ file, line, ...literal });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ERROR_HELPERS.has(node.expression.text)) {
      const argument = node.arguments[0];
      if (argument) push(argument, literalOf(argument));
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (name === 'HttpError' || name === 'ModerationHold') {
        const index = name === 'HttpError' ? 1 : 0;
        const argument = node.arguments?.[index];
        if (argument) push(argument, literalOf(argument));
      }
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'regex'
    ) {
      const argument = node.arguments[1];
      if (argument) push(argument, literalOf(argument));
    } else if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      if (name === 'message' || name === 'error') {
        for (const literal of literalsInside(node.initializer)) push(node, literal);
      } else if (name === 'reason') {
        for (const literal of literalsInside(node.initializer)) {
          if (!NON_MESSAGE_REASONS.has(literal.message)) push(node, literal);
        }
      }
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && MESSAGE_CONSTANT.test(node.name.text)) {
      const literal = literalOf(node.initializer);
      if (literal && !literal.dynamic) push(node, literal);
    }
    ts.forEachChild(node, visit);
  };

  visit(text);
  return found;
}

function dynamicProbeMatches(message: string): boolean {
  const translated = translateServerError(message, 400, 'en');
  return translated !== genericServerErrorEn(400) && !/[áéíóúÁÉÍÓÚñÑ¿¡]/.test(translated);
}

describe('SERVER_ERROR_EN contra los literales del API', () => {
  it('traduce todo mensaje fijo y todo patron variable sin dejar espanol', async () => {
    const files = await sourceFiles(API_SRC);
    expect(files.length).toBeGreaterThan(30);

    const found: Found[] = [];
    for (const file of files) found.push(...collect(await readFile(file, 'utf8'), file));
    expect(found.length).toBeGreaterThan(100);

    const missingExact: string[] = [];
    const missingPattern: string[] = [];
    for (const item of found) {
      const where = `${item.file}:${item.line} ${item.message}`;
      if (item.dynamic) {
        if (DYNAMIC_EXEMPT_FILES.has(item.file)) continue;
        if (!dynamicProbeMatches(item.message)) missingPattern.push(where);
        continue;
      }
      if (!SERVER_ERROR_EN[item.message]) {
        missingExact.push(where);
        continue;
      }
      const translated = translateServerError(item.message, 400, 'en');
      if (translated === genericServerErrorEn(400) || translated === item.message) missingExact.push(where);
      if (/[áéíóúÁÉÍÓÚñÑ¿¡]/.test(translated)) missingExact.push(`${where} -> ${translated}`);
    }

    expect({ missingExact, missingPattern }).toEqual({ missingExact: [], missingPattern: [] });
  });

  it('declara patrones para los mensajes que llevan numeros o campo', () => {
    expect(SERVER_ERROR_PATTERNS_EN.length).toBeGreaterThan(0);
  });
});

describe('translateServerError', () => {
  it('deja el espanol intacto, incluido un mensaje desconocido', () => {
    expect(translateServerError('Sesion requerida', 401, 'es')).toBe('Sesion requerida');
    expect(translateServerError('texto que no existe', 500, 'es')).toBe('texto que no existe');
  });

  it('traduce un mensaje fijo conocido al ingles', () => {
    expect(translateServerError('Sesion requerida', 401, 'en')).toBe(
      'Your session is missing or expired. Reload the page and try again.',
    );
  });

  it('traduce un mensaje variable conservando cifras y campo', () => {
    expect(translateServerError('Cupo insuficiente: quedan 2 plazas y pediste 5', 409, 'en')).toBe(
      'Not enough seats: 2 left and you requested 5.',
    );
    expect(translateServerError('minimumCents: El minimo no puede superar la meta', 400, 'en')).toBe(
      'minimumCents: The minimum cannot be higher than the goal.',
    );
    expect(translateServerError('title: Datos invalidos', 400, 'en')).toBe('title: The data is not valid.');
  });

  it('traduce el plazo agotado del asistente y el 504 no cae al generico de 500', () => {
    const assistantTimeout = 'El agente tardó demasiado en responder. Tu pregunta no se procesó; puedes reintentar.';
    expect(translateServerError(assistantTimeout, 504, 'en')).toBe(
      'The agent took too long to respond. Your question was not processed; you can try again.',
    );
    expect(genericServerErrorEn(504)).toMatch(/took too long|timed out/i);
    expect(genericServerErrorEn(504)).not.toBe(genericServerErrorEn(500));
    expect(translateServerError('mensaje desconocido', 504, 'en')).toBe(genericServerErrorEn(504));
  });

  it('nunca devuelve espanol para un mensaje desconocido en ingles', () => {
    const translated = translateServerError('Mensaje nuevo sin traducir', 418, 'en');
    expect(translated).toBe(genericServerErrorEn(418));
    expect(/[áéíóúÁÉÍÓÚñÑ¿¡]/.test(translated)).toBe(false);
  });

  it('cae al generico por estado, no al espanol, cuando no hay traduccion', () => {
    expect(genericServerErrorEn(400)).toMatch(/not valid/i);
    expect(genericServerErrorEn(429)).toMatch(/too many/i);
    expect(translateServerError('otro mensaje', 429, 'en')).toMatch(/too many/i);
  });
});
