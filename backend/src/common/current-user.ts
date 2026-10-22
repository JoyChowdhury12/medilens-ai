import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Use @CurrentUser() in a controller to get the logged-in user's id. */
export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest().userId;
});
