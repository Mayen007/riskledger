"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = registerApp;
function registerApp(app) {
    app.on("push", async (context) => {
        const repository = context.payload.repository.full_name;
        const ref = context.payload.ref;
        app.log.info({ repository, ref }, "Received push event");
    });
}
