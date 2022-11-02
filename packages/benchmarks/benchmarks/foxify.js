"use strict"

const Foxify = require("foxify").default;

const app = new Foxify();

app.disable("x-powered-by");

app.set("workers", 1);

const schema = {
  response: {
    200: {
      type: "object",
      properties: {
        hello: {
          type: "string",
        },
      },
    },
  },
};

app.get("/", (req, res) => res.json({ hello: "world" }));

app.start();
