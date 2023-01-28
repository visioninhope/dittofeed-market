import { FastifyInstance } from "fastify";

import contentController from "../controllers/contentController";
import indexController from "../controllers/indexController";
import journeysController from "../controllers/journeysController";
import segmentsController from "../controllers/segmentsController";
import settingsController from "../controllers/settingsController";
import webhooksController from "../controllers/webhooksController";

export default async function router(fastify: FastifyInstance) {
  await fastify.register(
    async (f: FastifyInstance) =>
      Promise.all([
        f.register(indexController),
        f.register(webhooksController, { prefix: "/webhooks" }),
        f.register(journeysController, { prefix: "/journeys" }),
        f.register(segmentsController, { prefix: "/segments" }),
        f.register(settingsController, { prefix: "/settings" }),
        f.register(contentController, { prefix: "/content" }),
      ]),
    { prefix: "/api" }
  );
}