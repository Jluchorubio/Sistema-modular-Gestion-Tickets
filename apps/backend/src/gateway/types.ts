import { Request } from 'express';

/** Shape of req.user as set by JwtStrategy.validate() — raw JWT payload. */
export interface JwtUser {
  sub:   string;
  email: string;
  iat?:  number;
  exp?:  number;
}

export interface RequestWithUser extends Request {
  user: JwtUser;
}
