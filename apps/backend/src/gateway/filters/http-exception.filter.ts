import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx    = host.switchToHttp();
    const res    = ctx.getResponse<Response>();
    const req    = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? (exception.getResponse() as any) : null;

    const message =
      exceptionResponse?.message ?? (exception instanceof HttpException ? exception.message : 'Internal server error');

    const type: string | undefined = exceptionResponse?.type;

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({
      statusCode: status,
      message,
      ...(type !== undefined ? { type } : {}),
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
