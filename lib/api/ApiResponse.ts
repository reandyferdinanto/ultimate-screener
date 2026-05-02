export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Date;
  requestId?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export class ApiResponseBuilder {
  static success<T>(data: T, message?: string): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message,
      timestamp: new Date(),
      requestId: this.generateRequestId()
    };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  static error(error: string, status: number = 500, details?: any): Response {
    const response: ApiResponse = {
      success: false,
      error,
      timestamp: new Date(),
      requestId: this.generateRequestId()
    };
    
    if (details) {
      (response as any).details = details;
    }

    return new Response(JSON.stringify(response), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  static paginated<T>(
    items: T[],
    total: number,
    page: number,
    limit: number
  ): Response {
    const paginatedData: PaginatedResponse<T> = {
      items,
      total,
      page,
      limit,
      hasNext: page * limit < total,
      hasPrev: page > 1
    };

    return this.success(paginatedData);
  }

  private static generateRequestId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}

export const withErrorHandling = (handler: (req: Request) => Promise<Response>) => {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (error) {
      console.error(`API Error [${req.method} ${req.url}]:`, error);
      return ApiResponseBuilder.error(
        error instanceof Error ? error.message : 'Internal server error',
        500
      );
    }
  };
};
