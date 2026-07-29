import type { Probot } from "probot";

export default function registerApp(app: Probot): void {
  app.on("push", async (context) => {
    const repository = context.payload.repository.full_name;
    const ref = context.payload.ref;

    app.log.info({ repository, ref }, "Received push event");
  });
}