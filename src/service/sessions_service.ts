import { Context } from "../util/context";

export default class SessionsService {
  async startSession(ctx: Context): Promise<void> {
    ctx.logger.info("[session_serv] Starting session");
  }

  async stopSession(ctx: Context): Promise<void> {
    ctx.logger.info("[session_serv] Stopping session");
  }

  async getSession(ctx: Context): Promise<void> {
    ctx.logger.info("[session_serv] Get session");
  }
}
