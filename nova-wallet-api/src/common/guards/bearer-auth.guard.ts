import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { ApiException } from "../exceptions/api.exception";

// Mock/hardcoded bearer token for this reference implementation. In a real
// deployment this would be replaced by OAuth2/JWT validation against an
// identity provider.
const API_TOKEN = process.env.API_TOKEN || "novapay-dev-token";

@Injectable()
export class BearerAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header("authorization") || request.header("Authorization");
    if (!header || !header.startsWith("Bearer ")) {
      throw new ApiException(401, "Missing or malformed Authorization header");
    }

    const token = header.slice("Bearer ".length).trim();
    if (token !== API_TOKEN) {
      throw new ApiException(401, "Invalid bearer token");
    }

    return true;
  }
}
