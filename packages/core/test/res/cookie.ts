import cookie from "cookie";
import cookieParser from "cookie-parser";
import Foxify from "../../src";

describe(".cookie(name, object)", () => {
  it("should generate a JSON cookie", async () => {
    expect.assertions(2);

    const app = new Foxify();

    app.get("/", (req, res) => {
      res.cookie("user", { name: "tobi" }).end();
    });

    const result = await app.inject("/");

    expect(result.statusCode).toBe(200);
    expect(result.headers["set-cookie"]).toBe(
      "user=j%3A%7B%22name%22%3A%22tobi%22%7D; Path=/",
    );
  });
});

describe(".cookie(name, string)", () => {
  it("should set a cookie", async () => {
    expect.assertions(2);

    const app = new Foxify();

    app.get("/", (req, res) => {
      res.cookie("name", "tobi").end();
    });

    const result = await app.inject("/");

    expect(result.statusCode).toBe(200);
    expect(result.headers["set-cookie"]).toBe("name=tobi; Path=/");
  });

  it("should allow multiple calls", async () => {
    expect.assertions(2);

    const app = new Foxify();

    app.get("/", (req, res) => {
      res.cookie("name", "tobi");
      res.cookie("age", 1);
      res.cookie("gender", "?");
      res.end();
    });

    const result = await app.inject("/");

    expect(result.statusCode).toBe(200);
    expect(result.headers["set-cookie"]).toEqual([
      "name=tobi; Path=/",
      "age=1; Path=/",
      "gender=%3F; Path=/",
    ]);
  });
});

describe(".cookie(name, string, options)", () => {
  it("should set params", async () => {
    expect.assertions(2);

    const app = new Foxify();

    app.get("/", (req, res) => {
      res.cookie("name", "tobi", { httpOnly: true, secure: true });
      res.end();
    });

    const result = await app.inject("/");

    expect(result.statusCode).toBe(200);
    expect(result.headers["set-cookie"]).toBe(
      "name=tobi; Path=/; HttpOnly; Secure",
    );
  });

  describe("maxAge", () => {
    it("should set relative expires", async () => {
      expect.assertions(2);

      const app = new Foxify();

      app.get("/", (req, res) => {
        res.cookie("name", "tobi", { maxAge: 1000 });
        res.end();
      });

      const result = await app.inject("/");

      expect(result.statusCode).toBe(200);
      expect((result.headers["set-cookie"] as any)[0]).not.toBe(
        "Thu, 01 Jan 1970 00:00:01 GMT",
      );
    });

    it("should set max-age", async () => {
      expect.assertions(1);

      const app = new Foxify();

      app.get("/", (req, res) => {
        res.cookie("name", "tobi", { maxAge: 1000 });
        res.end();
      });

      const result = await app.inject("/");

      expect(result.headers["set-cookie"]).toMatch(/Max-Age=1/);
    });

    it("should not mutate the options object", async () => {
      expect.assertions(2);

      const app = new Foxify();

      const options = { maxAge: 1000 };
      const optionsCopy = Object.assign({}, options);

      app.get("/", (req, res) => {
        res.cookie("name", "tobi", options);
        res.json(options);
      });

      const result = await app.inject("/");

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(optionsCopy);
    });
  });

  describe("signed", () => {
    it("should generate a signed JSON cookie", async () => {
      expect.assertions(2);

      const app = new Foxify();

      app.get("/", cookieParser("foo bar baz") as any);

      app.get("/", (req, res) => {
        res.cookie("user", { name: "tobi" }, { signed: true }).end();
      });

      const result = await app.inject("/");

      expect(result.statusCode).toBe(200);
      expect(
        cookie.parse((result.headers["set-cookie"] as any).split(".")[0]).user,
      ).toBe('s:j:{"name":"tobi"}');
    });
  });

  describe("signed without secret", () => {
    it("should throw an error", async () => {
      expect.assertions(2);

      const app = new Foxify();

      app.get("/", cookieParser() as any);

      app.get("/", (req, res) => {
        res.cookie("name", "tobi", { signed: true }).end();
      });

      const result = await app.inject("/");

      expect(result.statusCode).toBe(500);
      expect(result.body).toMatch(/secret\S+ required for signed cookies/);
    });
  });

  describe(".signedCookie(name, string)", () => {
    it("should set a signed cookie", async () => {
      expect.assertions(2);

      const app = new Foxify();

      app.get("/", cookieParser("foo bar baz") as any);

      app.get("/", (req, res) => {
        res.cookie("name", "tobi", { signed: true }).end();
      });

      const result = await app.inject("/");

      expect(result.statusCode).toBe(200);
      expect(result.headers["set-cookie"]).toBe(
        "name=s%3Atobi.xJjV2iZ6EI7C8E5kzwbfA9PVLl1ZR07UTnuTgQQ4EnQ; Path=/",
      );
    });
  });
});
