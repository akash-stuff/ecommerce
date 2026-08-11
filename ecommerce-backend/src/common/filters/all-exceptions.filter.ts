import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { RequestContextStore } from '../context/request-context';

interface ErrorBody {
  success: false;
  message: string;
  code: string;
  details?: unknown;
  requestId?: string;
}

/**
 * Single exit point for every error. Two jobs: produce the documented
 * `{ success, message, code }` envelope, and make sure a database error never
 * reaches the client with schema details attached.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = RequestContextStore.get()?.requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = {
      success: false,
      message: 'Something went wrong on our end.',
      code: 'INTERNAL_ERROR',
      requestId,
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        body = { success: false, message: response, code: codeFromStatus(status), requestId };
      } else {
        const r = response as Record<string, any>;
        body = {
          success: false,
          message: Array.isArray(r.message) ? r.message[0] : (r.message ?? exception.message),
          code: r.code ?? codeFromStatus(status),
          // The validation pipe puts its problems in `message` as an array;
          // a service raising its own error puts them in `details`. Both are
          // the same thing to a caller, so both are forwarded.
          details: Array.isArray(r.message)
            ? r.message
            : Array.isArray(r.details)
              ? r.details
              : undefined,
          requestId,
        };
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = mapPrismaError(exception);
      status = mapped.status;
      body = { success: false, message: mapped.message, code: mapped.code, requestId };
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      body = { success: false, message: 'Invalid request.', code: 'VALIDATION_ERROR', requestId };
    }

    if (status >= 500) {
      this.logger.error(
        `[${requestId}] ${body.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json(body);
  }
}

function codeFromStatus(status: number): string {
  const map: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'RATE_LIMITED',
  };
  return map[status] ?? 'INTERNAL_ERROR';
}

function mapPrismaError(e: Prisma.PrismaClientKnownRequestError): {
  status: number;
  message: string;
  code: string;
} {
  switch (e.code) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        message: 'That value is already taken.',
        code: 'DUPLICATE_ENTRY',
      };
    case 'P2003':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'A referenced record does not exist.',
        code: 'INVALID_REFERENCE',
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'Record not found.',
        code: 'NOT_FOUND',
      };
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Something went wrong on our end.',
        code: 'DATABASE_ERROR',
      };
  }
}
