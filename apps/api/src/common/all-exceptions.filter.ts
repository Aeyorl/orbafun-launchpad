import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * AllExceptionsFilter — global exception handler.
 *
 * Ensures unhandled errors return a clean JSON response without leaking
 * stack traces or internal details in production. HttpExceptions pass
 * through with their original status and message.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : (res as any).message || exception.message;
    } else {
      // Unexpected error — don't leak details in production
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      const err = exception as Error;
      this.logger.error(
        `Unhandled exception: ${err?.message || exception}`,
        err?.stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      message: Array.isArray(message) ? message : message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
