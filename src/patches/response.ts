import * as http from "http";
import * as path from "path";
import * as escapeHtml from "escape-html";
import * as contentType from "content-type";
import * as encodeUrl from "encodeurl";
import * as cookie from "cookie";
import { sign } from "cookie-signature";
import * as onFinished from "on-finished";
import * as contentDisposition from "content-disposition";
import * as vary from "vary";
import send = require("send");
import * as constants from "../constants";
import * as Foxify from "../index";
import * as utils from "../utils";
import { Engine } from "../view";

declare module "http" {
  export interface ServerResponse {
    req: http.IncomingMessage;

    set: http.ServerResponse["header"];
    type: http.ServerResponse["contentType"];

    /**
     * @hidden
     */
    stringify?: any;

    /**
     * Append additional header `field` with value `val`.
     *
     * @returns for chaining
     * @example
     * res.append("Link", ["<http://localhost/>", "<http://localhost:3000/>"]);
     * @example
     * res.append("Set-Cookie", "foo=bar; Path=/; HttpOnly");
     * @example
     * res.append("Warning", "199 Miscellaneous warning");
     */
    append(field: string, val: string | string[]): this;

    /**
     * Set _Content-Disposition_ header to _attachment_ with optional `filename`.
     */
    attachment(filename?: string): this;

    /**
     * Clear cookie `name`.
     *
     * @returns for chaining
     */
    clearCookie(name: string, options?: object): this;

    /**
     * Set _Content-Type_ response header with `type` through `mime.lookup()`
     * when it does not contain "/", or set the Content-Type to `type` otherwise.
     *
     * @returns for chaining
     * @example
     * res.type(".html");
     * @example
     * res.type("html");
     * @example
     * res.type("json");
     * @example
     * res.type("application/json");
     * @example
     * res.type("png");
     */
    contentType(type: string): this;

    /**
     * Set cookie `name` to `value`, with the given `options`.
     *
     * Options:
     *    - `maxAge`   max-age in milliseconds, converted to `expires`
     *    - `signed`   sign the cookie
     *    - `path`     defaults to "/"
     *
     * @returns for chaining
     * @example
     * // "Remember Me" for 15 minutes
     * res.cookie("rememberme", "1", { expires: new Date(Date.now() + 900000), httpOnly: true });
     * @example
     * // save as above
     * res.cookie("rememberme", "1", { maxAge: 900000, httpOnly: true })
     */
    cookie(name: string, value: string | object, options?: object): this;

    /**
     * Transfer the file at the given `path` as an attachment.
     *
     * Optionally providing an alternate attachment `filename`,
     * and optional callback `callback(err)`. The callback is invoked
     * when the data transfer is complete, or when an error has
     * ocurred. Be sure to check `res.headersSent` if you plan to respond.
     *
     * Optionally providing an `options` object to use with `res.sendFile()`.
     * This function will set the `Content-Disposition` header, overriding
     * any `Content-Disposition` header passed as header options in order
     * to set the attachment and filename.
     *
     * This method uses `res.sendFile()`.
     */
    download(path: string, filename: string, options?: object, callback?: (...args: any[]) => void): void;

    /**
     * Respond to the Acceptable formats using an `obj`
     * of mime-type callbacks.
     *
     * This method uses `req.accepted`, an array of
     * acceptable types ordered by their quality values.
     * When "Accept" is not present the _first_ callback
     * is invoked, otherwise the first match is used. When
     * no match is performed the server responds with
     * 406 "Not Acceptable".
     *
     * By default Foxify passes an `Error`
     * with a `.status` of 406 to `next(err)`
     * if a match is not made. If you provide
     * a `.default` callback it will be invoked
     * instead.
     *
     * Content-Type is set for you, however if you choose
     * you may alter this within the callback using `res.type()`
     * or `res.set("Content-Type", ...)`.
     *
     * @returns for chaining
     * @example
     * res.format({
     *   "text/plain": function() {
     *     res.send("hey");
     *   },
     *   "text/html": function() {
     *     res.send("<p>hey</p>");
     *   },
     *   "appliation/json": function() {
     *     res.send({ message: "hey" });
     *   }
     * });
     * @example
     * // In addition to canonicalized MIME types you may
     * // also use extnames mapped to these types:
     *
     * res.format({
     *   text: function() {
     *     res.send("hey");
     *   },
     *   html: function() {
     *     res.send("<p>hey</p>");
     *   },
     *   json: function() {
     *     res.send({ message: "hey" });
     *   }
     * });
     */
    format(format: object): this;

    /**
     * Get value for header `field`.
     */
    get(field: string): string | number | string[] | undefined;

    /**
     * Set header `field` to `val`, or pass
     * an object of header fields.
     *
     * @returns for chaining
     * @example
     * res.set("Foo", ["bar", "baz"]);
     * @example
     * res.set("Accept", "application/json");
     * @example
     * res.set({ Accept: "text/plain", "X-API-Key": "tobi" });
     */
    header(field: string | object, value?: string | string[]): this;

    /**
     * Send JSON response.
     *
     * @example
     * res.json({ user: "tj" });
     */
    json(response: object, status?: number): this;

    /**
     * Send JSON response with JSONP callback support.
     *
     * @example
     * res.jsonp({ user: "tj" });
     */
    jsonp(response: object, status?: number): this;

    /**
     * Set Link header field with the given links.
     *
     * @example
     * res.links({
     *   next: "http://api.example.com/users?page=2",
     *   last: "http://api.example.com/users?page=5"
     * });
     */
    links(links: object): this;

    /**
     * Set the location header to `url`.
     *
     * The given `url` can also be "back", which redirects
     * to the _Referrer_ or _Referer_ headers or "/".
     *
     * @returns for chaining
     * @example
     * res.location("/foo/bar").;
     * @example
     * res.location("http://example.com");
     * @example
     * res.location("../login");
     */
    location(url: string): this;

    /**
     * Redirect to the given `url` with optional response `status`
     * defaulting to 302.
     *
     * The resulting `url` is determined by `res.location()`, so
     * it will play nicely with mounted apps, relative paths,
     * `"back"` etc.
     *
     * @example
     * res.redirect("/foo/bar");
     * @example
     * res.redirect("http://example.com");
     * @example
     * res.redirect(301, "http://example.com");
     * @example
     * res.redirect("../login"); // /blog/post/1 -> /blog/login
     */
    redirect(url: string): void;
    redirect(code: number, url: string): void;

    render(view: string, options?: object, callback?: Engine.Callback): void;

    /**
     * Send a response.
     *
     * @example
     * res.send(Buffer.from("wahoo"));
     * @example
     * res.send({ some: "json" });
     * @example
     * res.send("<p>some html</p>");
     */
    send(body: string | object | Buffer): this;

    /**
     * Transfer the file at the given `path`.
     *
     * Automatically sets the _Content-Type_ response header field.
     * The callback `callback(err)` is invoked when the transfer is complete
     * or when an error occurs. Be sure to check `res.sentHeader`
     * if you wish to attempt responding, as the header and some data
     * may have already been transferred.
     *
     * Options:
     *   - `maxAge`   defaulting to 0 (can be string converted by `ms`)
     *   - `root`     root directory for relative filenames
     *   - `headers`  object of headers to serve with file
     *   - `dotfiles` serve dotfiles, defaulting to false; can be `"allow"` to send them
     *
     * Other options are passed along to `send`.
     *
     * @example
     * // The following example illustrates how `res.sendFile()` may
     * // be used as an alternative for the `static()` middleware for
     * // dynamic situations. The code backing `res.sendFile()` is actually
     * // the same code, so HTTP cache support etc is identical.
     *
     * app.get("/user/:uid/photos/:file", function(req, res) {
     *   let uid = req.params.uid;
     *   let file = req.params.file;
     *
     *   req.user.mayViewFilesFrom(uid, function(yes) {
     *     if (yes) {
     *       res.sendFile("/uploads/" + uid + "/" + file);
     *     } else {
     *       res.send(403, "Sorry! you cant see that.");
     *     }
     *   });
     * });
     */
    sendFile(path: string, options?: object | ((...args: any[]) => void), callback?: (...args: any[]) => void): void;

    /**
     * Send given HTTP status code.
     *
     * Sets the response status to `statusCode` and the body of the
     * response to the standard description from node's http.STATUS_CODES
     * or the statusCode number if no description.
     *
     * @example
     * res.sendStatus(200);
     */
    sendStatus(statusCode: number): this;

    /**
     * Set response status code.
     *
     * @example
     * res.status(500);
     */
    status(code: number): this;

    /**
     * Add `field` to Vary. If already present in the Vary set, then
     * this call is simply ignored.
     *
     * @returns for chaining
     */
    vary(field: string | string[]): this;
  }
}

const resolve = path.resolve;
const STATUS_CODES = http.STATUS_CODES;

const charsetRegExp = /;\s*charset\s*=/;

/**
 * Set the charset in a given Content-Type string.
 *
 * @param {String} type
 * @param {String} charset
 * @return {String}
 * @api private
 */
const setCharset = (type?: string, charset?: string) => {
  if (!type || !charset) return type;

  // parse type
  const parsed = contentType.parse(type);

  // set charset
  parsed.parameters.charset = charset;

  // format type
  return contentType.format(parsed);
};

/**
 * Stringify JSON, like JSON.stringify, but v8 optimized, with the
 * ability to escape characters that can trigger HTML sniffing.
 *
 * @param {*} value
 * @param {function} replaces
 * @param {number} spaces
 * @param {boolean} escape
 * @returns {string}
 * @private
 */
const stringify = (value: any, replacer?: (key: string, value: any) => any, spaces?: number, escape?: boolean) => {
  // v8 checks arguments.length for optimizing simple call
  // https://bugs.chromium.org/p/v8/issues/detail?id=4730
  let json = JSON.stringify(value, replacer, spaces);

  if (escape)
    json = json.replace(/[<>&]/g, (c) => {
      switch (c.charCodeAt(0)) {
        case 0x3c:
          return "\\u003c";
        case 0x3e:
          return "\\u003e";
        case 0x26:
          return "\\u0026";
        default:
          return c;
      }
    });

  return json;
};

/**
 * Check if `path` looks absolute.
 *
 * @param {String} path
 * @return {Boolean}
 * @api private
 */
const isAbsolute = (path: string) => {
  if ("/" === path[0]) return true;
  if (":" === path[1] && ("\\" === path[2] || "/" === path[2])) return true; // Windows device path
  if ("\\\\" === path.substring(0, 2)) return true; // Microsoft Azure absolute path
};

/**
 * pipe the send file stream
 */
const sendfile = (
  res: http.ServerResponse,
  file: send.SendStream,
  options: object,
  callback: (...args: any[]) => void,
) => {
  let done = false;
  let streaming: boolean;

  // request aborted
  function onaborted() {
    if (done) return;

    done = true;

    const err = new Error("Request aborted");

    (err as any).code = "ECONNABORTED";

    callback(err);
  }

  // directory
  function ondirectory() {
    if (done) return;

    done = true;

    const err = new Error("EISDIR, read");

    (err as any).code = "EISDIR";

    callback(err);
  }

  // errors
  function onerror(err: Error) {
    if (done) return;

    done = true;

    callback(err);
  }

  // ended
  function onend() {
    if (done) return;

    done = true;

    callback();
  }

  // file
  function onfile() {
    streaming = false;
  }

  // finished
  function onfinish(err: any) {
    if (err && err.code === "ECONNRESET") return onaborted();
    if (err) return onerror(err);
    if (done) return;

    setImmediate(() => {
      if (streaming !== false && !done) {
        onaborted();
        return;
      }

      if (done) return;

      done = true;

      callback();
    });
  }

  // streaming
  function onstream() {
    streaming = true;
  }

  file.on("directory", ondirectory);
  file.on("end", onend);
  file.on("error", onerror);
  file.on("file", onfile);
  file.on("stream", onstream);

  onFinished(res, onfinish);

  if ((options as any).headers)
    // set headers on successful transfer
    file.on("headers", (res: http.ServerResponse) => {
      const obj = (options as any).headers;
      const keys = Object.keys(obj);

      let k;
      for (let i = 0; i < keys.length; i++) {
        k = keys[i];

        res.setHeader(k, obj[k]);
      }
    });

  // pipe
  file.pipe(res);
};

/**
 * Parse accept params `str` returning an
 * object with `.value`, `.quality` and `.params`.
 * also includes `.originalIndex` for stable sorting
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */
const acceptParams = (str: string, index?: number) => {
  const parts = str.split(/ *; */);

  const ret = {
    value: parts[0],
    quality: 1,
    params: <{ [key: string]: any }>{},
    originalIndex: index,
  };

  let pms;
  for (let i = 1; i < parts.length; ++i) {
    pms = parts[i].split(/ *= */);

    if ("q" === pms[0])
      ret.quality = parseFloat(pms[1]);
    else
      ret.params[pms[0]] = pms[1];
  }

  return ret;
};

/**
 * Normalize the given `type`, for example "html" becomes "text/html".
 *
 * @param {String} type
 * @return {Object}
 * @api private
 */
const normalizeType = (type: string) => {
  return ~type.indexOf("/")
    ? acceptParams(type)
    : { value: (send.mime as any).lookup(type), params: {} };
};

/**
 * Normalize `types`, for example "html" becomes "text/html".
 *
 * @param {Array} types
 * @return {Array}
 * @api private
 */
const normalizeTypes = (types: string[]) => {
  const ret = [];

  for (let i = 0; i < types.length; ++i) ret.push(exports.normalizeType(types[i]));

  return ret;
};

const patch = (res: typeof http.ServerResponse, options: Foxify.Options, settings: Foxify.Settings): any => {

  /* json options */
  const jsonOptions = {
    escape: options.json.escape,
    spaces: settings.json.spaces,
    replacer: settings.json.replacer,
  };

  class ServerResponse extends res {
    append(field: string, val: string | string[]) {
      const prev = this.get(field);
      let value: any = val;

      if (prev)
        // concat the new and prev vals
        value = Array.isArray(prev) ? prev.concat(val)
          : Array.isArray(val) ? [prev].concat(val)
            : [prev, val];

      return this.set(field, value) as any;
    }

    attachment(filename?: string) {
      if (filename) this.type(path.extname(filename));

      this.set("Content-Disposition", contentDisposition(filename));

      return this;
    }

    clearCookie(name: string, options: object = {}) {
      const opts = Object.assign({}, { expires: new Date(1), path: "/" }, options);

      return this.cookie(name, "", opts);
    }

    contentType(type: string) {
      return this.set("Content-Type", type.indexOf("/") === -1
        ? (send.mime as any).lookup(type)
        : type,
      ) as any;
    }

    cookie(name: string, value: string | object, options: object = {}) {
      const opts: { [key: string]: any } = Object.assign({}, options);
      const secret = (this.req as any).secret;
      const signed = opts.signed;

      if (signed && !secret) throw new Error("cookieParser('secret') required for signed cookies");

      let val = utils.object.isObject(value)
        ? "j:" + JSON.stringify(value)
        : String(value);

      if (signed) val = "s:" + sign(val, secret);

      if ("maxAge" in opts) {
        opts.expires = new Date(Date.now() + opts.maxAge);
        opts.maxAge /= 1000;
      }

      if (opts.path == null) opts.path = "/";

      this.append("Set-Cookie", cookie.serialize(name, String(val), opts));

      return this;
    }

    download(path: string, filename: string, options?: object, callback?: (...args: any[]) => void) {
      let done: any = callback;
      let name: any = filename;
      let opts = options || null;

      // support function as second or third arg
      if (utils.function.isFunction(filename)) {
        done = filename;
        name = null;
        opts = null;
      } else if (utils.function.isFunction(options)) {
        done = options;
        opts = null;
      }

      // set Content-Disposition when file is sent
      const headers = {
        "Content-Disposition": contentDisposition(name || path),
      };

      // merge user-provided headers
      if (opts && (opts as { [key: string]: any }).headers) {
        const keys = Object.keys((opts as { [key: string]: any }).headers);

        let key;
        for (let i = 0; i < keys.length; i++) {
          key = keys[i];

          if (key.toLowerCase() !== "content-disposition")
            (headers as { [key: string]: any })[key] = (opts as { [key: string]: any }).headers[key];
        }
      }

      // merge user-provided options
      opts = Object.create(opts)
        (opts as { [key: string]: any }).headers = headers;

      // Resolve the full path for sendFile
      const fullPath = resolve(path);

      // send file
      return this.sendFile(fullPath, opts, done);
    }

    format(obj: { [key: string]: any }) {
      const req = this.req;
      const next = req.next;

      const fn = obj.default;

      if (fn) delete obj.default;

      const keys = Object.keys(obj);

      const key = keys.length > 0
        ? <string>req.accepts(keys)
        : false;

      this.vary("Accept");

      if (key) {
        this.set("Content-Type", normalizeType(key).value);
        obj[key](req, this, next);
      } else if (fn)
        fn();
      else {
        const err: any = new Error("Not Acceptable");

        err.status = err.statusCode = 406;
        err.types = normalizeTypes(keys).map((o) => o.value);

        throw err;
      }

      return this;
    }

    header(field: string | object, val?: string | string[]) {
      if (val) {
        let value = Array.isArray(val)
          ? val.map((v) => `${v}`)
          : `${val}`;

        // add charset to content-type
        if ((field as string).toLowerCase() === "content-type") {
          if (Array.isArray(value)) throw new TypeError("Content-Type cannot be set to an Array");

          if (!charsetRegExp.test(value)) {
            const charset = (send.mime as any).charsets.lookup(value.split(";")[0]);

            if (charset) value += "; charset=" + charset.toLowerCase();
          }
        }

        this.setHeader(<string>field, value);
      } else
        for (const key in <object>field) this.set(key, (field as { [key: string]: any })[key]);

      return this;
    }

    json(obj: object, status?: number) {
      const _stringify = this.stringify || stringify;

      // if (!this.get("Content-Type")) this.setHeader("Content-Type", "application/json");
      this.setHeader("Content-Type", "application/json");

      if (status) this.status(status);

      return this.send(
        _stringify(
          obj,
          jsonOptions.replacer,
          jsonOptions.spaces,
          jsonOptions.escape,
        ),
      );
    }

    jsonp(obj: object, status?: number) {
      // settings
      const app = (this as any).app;
      const escape = jsonOptions.escape;
      const replacer = jsonOptions.replacer;
      const spaces = jsonOptions.spaces;
      let body = stringify(obj, replacer, spaces, escape);
      let callback = this.req.query[app.get("jsonp callback name")];

      if (status) this.status(status);

      // content-type
      if (!this.get("Content-Type")) {
        this.set("X-Content-Type-Options", "nosniff");
        this.set("Content-Type", "application/json");
      }

      // fixup callback
      if (Array.isArray(callback)) callback = callback[0];

      // jsonp
      if (utils.string.isString(callback) && callback.length !== 0) {
        this.set("X-Content-Type-Options", "nosniff");
        this.set("Content-Type", "text/javascript");

        // restrict callback charset
        callback = callback.replace(/[^\[\]\w$.]/g, "");

        // replace chars not allowed in JavaScript that are in JSON
        body = body
          .replace(/\u2028/g, "\\u2028")
          .replace(/\u2029/g, "\\u2029");

        // the /**/ is a specific security mitigation for "Rosetta Flash JSONP abuse"
        // the typeof check is just to reduce client error noise
        body = "/**/ typeof " + callback + " === 'function' && " + callback + "(" + body + ");";
      }

      return this.send(body);
    }

    links(links: { [key: string]: string }) {
      const link = `${this.get("Link") || ""}, `;

      return this.set(
        "Link",
        link + Object.keys(links)
          .map((rel) => `<${links[rel]}>; rel="${rel}"`)
          .join(", "),
      ) as any;
    }

    location(url: string) {
      // set location
      return this.set(
        "Location",
        encodeUrl(
          // "back" is an alias for the referrer
          url === "back" ?
            this.req.get("Referrer") || "/" :
            url,
        ),
      ) as any;
    }

    redirect(url: string | number) {
      let address = <string>url;
      let body: string = "";
      let status = 302;

      // allow status / url
      if (arguments.length === 2) {
        status = arguments[0];
        address = arguments[1];
      }

      // Set location header
      address = <string>this.location(address).get("Location");

      // Support text/{plain,html} by default
      this.format({
        text: () => {
          body = STATUS_CODES[status] + ". Redirecting to " + address;
        },

        html: () => {
          const u = escapeHtml(address);
          body = "<p>" + STATUS_CODES[status] + ". Redirecting to <a href=\"' + u + '\">' + u + '</a></p>";
        },

        default: () => {
          body = "";
        },
      });

      // Respond
      this.statusCode = status;
      this.set("Content-Length", <any>Buffer.byteLength(body));

      if (this.req.method === "HEAD")
        this.end();
      else
        this.end(body);
    }

    sendFile(path: string, options?: object | ((...args: any[]) => void), callback?: (...args: any[]) => void) {
      let done = callback;
      const req = this.req;
      const res = this;
      const next = req.next;
      let opts = options || {};

      if (!path) throw new TypeError("path argument is required to res.sendFile");

      // support function as second arg
      if (utils.function.isFunction(options)) {
        done = options;
        opts = {};
      }

      if (!(opts as any).root && !isAbsolute(path))
        throw new TypeError("path must be absolute or specify root to res.sendFile");

      // create file stream
      const pathname = encodeURI(path);
      const file = send(req, pathname, opts);

      // transfer
      sendfile(res, file, opts, (err: any) => {
        if (done) return done(err);
        if (err && err.code === "EISDIR") return next();

        // next() all but write errors
        if (err && err.code !== "ECONNABORTED" && err.syscall !== "write") throw err;
      });
    }

    sendStatus(statusCode: number) {
      this.statusCode = statusCode;

      this.type("txt");

      return this.send(STATUS_CODES[statusCode] || `${statusCode}`);
    }

    status(code: number) {
      this.statusCode = code;

      return this;
    }

    vary(field: string | string[]) {
      vary(this, field);

      return this;
    }
  }

  ServerResponse.prototype.type = ServerResponse.prototype.contentType;
  ServerResponse.prototype.set = ServerResponse.prototype.header;
  ServerResponse.prototype.get = ServerResponse.prototype.getHeader;

  if (options["content-length"])
    ServerResponse.prototype.send = function (body) {
      const req = this.req;
      let contentType = <string>this.get("Content-Type");
      let chunk = body;
      let encoding;

      // populate Content-Length
      let len;

      if (utils.string.isString(chunk)) {
        encoding = "utf8";

        if ((chunk as any).length < 1000)
          // just calculate length when no ETag + small chunk
          len = Buffer.byteLength(<string>chunk, encoding);
        else {
          // convert chunk to Buffer and calculate
          chunk = Buffer.from(<string>chunk, encoding);
          encoding = undefined;
          len = (chunk as Buffer).length;
        }

        if (!contentType) {
          // string defaulting to html
          contentType = "text/html";

          // reflect this in content-type
          this.setHeader("Content-Type", <string>setCharset(contentType, "utf-8"));
        }
      } else if (Buffer.isBuffer(chunk)) {
        if (!contentType) this.type("bin");

        // get length of Buffer
        len = chunk.length;
      } else
        return this.json(<object>chunk);

      this.setHeader("Content-Length", len);

      // freshness
      if (req.fresh) this.statusCode = constants.http.NOT_MODIFIED;

      // strip irrelevant headers
      if (constants.http.NO_CONTENT === this.statusCode || constants.http.NOT_MODIFIED === this.statusCode) {
        this.removeHeader("Content-Type");
        this.removeHeader("Content-Length");
        this.removeHeader("Transfer-Encoding");

        chunk = "";
      }

      // skip body for HEAD
      if (req.method === "HEAD") this.end();
      else this.end(chunk, encoding);

      return this;
    };
  else
    ServerResponse.prototype.send = function (body) {
      const req = this.req;
      const contentType = this.get("Content-Type") as string;
      let chunk = body;

      if (utils.string.isString(chunk)) {
        if (!contentType)
          // reflect this in content-type
          this.setHeader("Content-Type", setCharset("text/html", "utf-8") as string);
      } else if (Buffer.isBuffer(chunk)) {
        if (!contentType) this.type("bin");
      } else
        return this.json(<object>chunk);

      // freshness
      if (req.fresh) this.statusCode = constants.http.NOT_MODIFIED;

      // strip irrelevant headers
      if (constants.http.NO_CONTENT === this.statusCode || constants.http.NOT_MODIFIED === this.statusCode) {
        this.removeHeader("Content-Type");
        this.removeHeader("Content-Length");
        this.removeHeader("Transfer-Encoding");

        chunk = "";
      }

      // skip body for HEAD
      if (req.method === "HEAD") this.end();
      else this.end(chunk, "utf8");

      return this;
    };

  return ServerResponse;
};

export = patch;
