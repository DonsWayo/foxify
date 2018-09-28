import * as http from "http";
import * as assert from "assert";
import * as fastDecode from "fast-decode-uri-component";
import * as fastStringify from "fast-json-stringify";
import isRegexSafe = require("safe-regex");
import * as Request from "../Request";
import * as Response from "../Response";
import * as utils from "../utils";
import { Encapsulation } from "../exceptions";
import httpMethods, { Method } from "./httpMethods";
import * as Layer from "./Layer";
import * as Foxify from "..";

/*
  Char codes:
    "#": 35
    "*": 42
    "-": 45
    "/": 47
    ":": 58
    ";": 59
    "?": 63
*/

const NODE_TYPES = Layer.TYPES;

const EMPTY_HANDLE = { handlers: [], params: {} };

const pathMatchesMiddleware = (path: string, middleware: string) => {
  if (middleware === "*") return true;

  return false;
};

const sanitizeUrl = (url: string) => {
  const len = url.length;

  for (let i = 0; i < len; i++) {
    const charCode = url.charCodeAt(i);

    // Some systems do not follow RFC and separate the path and query
    // string with a `;` character (code 59), e.g. `/foo;jsessionid=123456`.
    // Thus, we need to split on `;` as well as `?` and `#`.
    if (charCode === 63 || charCode === 59 || charCode === 35)
      return url.slice(0, i);
  }

  return url;
};

const getWildcardNode = (layer: Layer | null, method: Method, path: string, len: number) => {
  if (layer === null) return EMPTY_HANDLE;

  const decoded = fastDecode(path.slice(-len));

  if (decoded === null) return EMPTY_HANDLE;

  const handlers = layer.handlers[method];

  if (handlers.length > 0) return {
    handlers,
    params: { "*": decoded },
  };

  return EMPTY_HANDLE;
};

const getClosingParenthensePosition = (path: string, idx: number) => {
  // `path.indexOf()` will always return the first position of the closing parenthese,
  // but it's inefficient for grouped or wrong regexp expressions.
  // see issues #62 and #63 for more info

  let parentheses = 1;

  while (idx < path.length) {
    idx++;

    // ignore skipped chars
    if (path[idx] === "\\") {
      idx++;

      continue;
    }

    if (path[idx] === ")") parentheses--;
    else if (path[idx] === "(") parentheses++;

    if (!parentheses) return idx;
  }

  throw new TypeError(`Invalid regexp expression in "${path}"`);
};

module Router {
  export interface Middleware {
    path: string;
    handlers: Layer.Handler[];
  }

  export interface Route {
    method: Method;
    path: string;
    opts: Layer.RouteOptions;
    handlers: Layer.Handler[];
  }

  export type MethodFunction<T = Router> =
    (path: string, options: Layer.RouteOptions | Layer.Handler, ...handlers: Layer.Handler[]) => T;

  export type PathMethodFunction<T = Router> =
    (options: Layer.RouteOptions | Layer.Handler, ...handlers: Layer.Handler[]) => T;

  export interface MethodFunctions<T = Router> {
    get: Router.MethodFunction<T>;
    post: Router.MethodFunction<T>;
    put: Router.MethodFunction<T>;
    head: Router.MethodFunction<T>;
    delete: Router.MethodFunction<T>;
    options: Router.MethodFunction<T>;
    trace: Router.MethodFunction<T>;
    copy: Router.MethodFunction<T>;
    lock: Router.MethodFunction<T>;
    mkcol: Router.MethodFunction<T>;
    move: Router.MethodFunction<T>;
    purge: Router.MethodFunction<T>;
    propfind: Router.MethodFunction<T>;
    proppatch: Router.MethodFunction<T>;
    unlock: Router.MethodFunction<T>;
    report: Router.MethodFunction<T>;
    mkactivity: Router.MethodFunction<T>;
    checkout: Router.MethodFunction<T>;
    merge: Router.MethodFunction<T>;
    "m-search": Router.MethodFunction<T>;
    notify: Router.MethodFunction<T>;
    subscribe: Router.MethodFunction<T>;
    unsubscribe: Router.MethodFunction<T>;
    patch: Router.MethodFunction<T>;
    search: Router.MethodFunction<T>;
    connect: Router.MethodFunction<T>;
  }

  export interface PathMethods<T = any> {
    get: Router.PathMethodFunction<T>;
    post: Router.PathMethodFunction<T>;
    put: Router.PathMethodFunction<T>;
    head: Router.PathMethodFunction<T>;
    delete: Router.PathMethodFunction<T>;
    options: Router.PathMethodFunction<T>;
    trace: Router.PathMethodFunction<T>;
    copy: Router.PathMethodFunction<T>;
    lock: Router.PathMethodFunction<T>;
    mkcol: Router.PathMethodFunction<T>;
    move: Router.PathMethodFunction<T>;
    purge: Router.PathMethodFunction<T>;
    propfind: Router.PathMethodFunction<T>;
    proppatch: Router.PathMethodFunction<T>;
    unlock: Router.PathMethodFunction<T>;
    report: Router.PathMethodFunction<T>;
    mkactivity: Router.PathMethodFunction<T>;
    checkout: Router.PathMethodFunction<T>;
    merge: Router.PathMethodFunction<T>;
    "m-search": Router.PathMethodFunction<T>;
    notify: Router.PathMethodFunction<T>;
    subscribe: Router.PathMethodFunction<T>;
    unsubscribe: Router.PathMethodFunction<T>;
    patch: Router.PathMethodFunction<T>;
    search: Router.PathMethodFunction<T>;
    connect: Router.PathMethodFunction<T>;
  }
}

interface Router extends Router.MethodFunctions { }

class Router {
  tree = new Layer();

  middlewares: Router.Middleware[] = [];

  routes: Router.Route[] = [];

  caseSensitive = true;

  ignoreTrailingSlash = false;

  maxParamLength = 100;

  allowUnsafeRegex = false;

  constructor() {
    httpMethods.forEach((method) => {
      const methodName = method.toLowerCase();

      if ((this as any)[methodName]) throw new Error(`Method already exists: ${methodName}`);

      (this as any)[methodName] =
        (path: string, opts: Layer.RouteOptions | Layer.Handler, ...handler: Layer.Handler[]) =>
          this.on(method, path, opts, ...handler);
    });
  }

  protected _on(method: Method | Method[], path: string, opts: Layer.RouteOptions = {}, handlers: Layer.Handler[]) {
    if (Array.isArray(method)) {
      method.forEach((m) => this._on(m, path, opts, handlers));

      return this;
    }

    // method validation
    assert(typeof method === "string", "Method should be a string");
    assert(httpMethods.indexOf(method) !== -1, `Method "${method}" is not an http method.`);

    this.routes.push({ method, path, opts, handlers });

    return this;
  }

  protected _insert(
    method: Method, path: string, kind: number,
    params: string[] | undefined, handlers: Layer.Handler[] = [], regex: RegExp | null
  ) {
    const route = path;
    let currentNode = this.tree;
    let prefix = "";
    let pathLen = 0;
    let prefixLen = 0;
    let len = 0;
    let max = 0;
    let node = null;

    while (true) {
      prefix = currentNode.prefix;
      prefixLen = prefix.length;
      pathLen = path.length;
      len = 0;

      // search for the longest common prefix
      max = pathLen < prefixLen ? pathLen : prefixLen;
      while (len < max && path[len] === prefix[len]) len++;

      // the longest common prefix is smaller than the current prefix
      // let's split the node and add a new child
      if (len < prefixLen) {
        node = new Layer(
          prefix.slice(len),
          currentNode.children,
          currentNode.kind,
          new (Layer.Handlers as any)(currentNode.handlers),
          currentNode.regex,
          params
        );

        if (currentNode.wildcardChild !== null)
          node.wildcardChild = currentNode.wildcardChild;

        // reset the parent
        currentNode
          .reset(prefix.slice(0, len))
          .addChild(node);

        // if the longest common prefix has the same length of the current path
        // the handler should be added to the current node, to a child otherwise
        if (len === pathLen) {
          assert(!currentNode.getHandler(method), `Method "${method}" already declared for route "${route}"`);

          currentNode.addHandler(method, handlers);
          currentNode.kind = kind;
        } else {
          node = new Layer(path.slice(len), {}, kind, undefined, regex, params);
          node.addHandler(method, handlers);
          currentNode.addChild(node);
        }

        // the longest common prefix is smaller than the path length,
        // but is higher than the prefix
      } else if (len < pathLen) {
        // remove the prefix
        path = path.slice(len);
        // check if there is a child with the label extracted from the new path
        node = currentNode.findByLabel(path);
        // there is a child within the given label, we must go deepen in the tree
        if (node) {
          currentNode = node;

          continue;
        }
        // there are not children within the given label, let's create a new one!
        node = new Layer(path, {}, kind, undefined, regex, params);
        node.addHandler(method, handlers);

        currentNode.addChild(node);

        // the node already exist
        // } else if (handler) {
      } else if (handlers)
        // assert(!currentNode.getHandler(method), `Method "${method}" already declared for route "${route}"`);
        currentNode.addHandler(method, handlers);
      // }

      return this;
    }
  }

  protected _next = (req: Request, res: Response, handlers: Encapsulation[], index = 0) => {
    const handler = handlers[index];

    if (!handler) throw new HttpException(HTTP.NOT_FOUND);

    const next = () => this._safeNext.run(req, res, handlers, index + 1);

    req.next = next;

    handler.run(req, res, next);
  }

  protected _safeNext = new Encapsulation(this._next);

  initialize(app: Foxify) {
    this.caseSensitive = app.enabled("routing.case-sensitive");
    this.ignoreTrailingSlash = app.enabled("routing.ignore-trailing-slash");
    this.allowUnsafeRegex = app.enabled("routing.allow-unsafe-regex");
    this.maxParamLength = app.get("routing.max-param-length");

    const middlewares = this.middlewares.reduce((prev, middleware) => {
      httpMethods.forEach((method) => prev.push({ ...middleware, opts: {}, method }));

      return prev;
    }, [] as Router.Route[]);

    const routes = this.routes.reduce(
      (prev, { method, path, opts, handlers }) => {
        const options = opts;

        const schema: { response: { [statusCode: number]: any } } | undefined = options.schema;

        if (schema) schema.response = utils.object.mapValues(
          schema.response,
          (value) => fastStringify(value)
        );

        options.schema = schema;

        const newHandlers = middlewares
          .filter((middleware) => method === middleware.method && pathMatchesMiddleware(path, middleware.path))
          .reduce((prev, { handlers }) => prev.concat(handlers), [] as Layer.Handler[])
          .concat(handlers);

        const newRoutes = [{ method, path, opts: options, handlers: newHandlers }];

        if (this.ignoreTrailingSlash && path !== "/" && !path.endsWith("*")) {
          let newRoute = { method, path: `${path}/`, opts: options, handlers: newHandlers };

          if (path.endsWith("/")) newRoute = { method, path: path.slice(0, -1), opts: options, handlers: newHandlers };

          newRoutes.push(newRoute);
        }

        return prev.concat(newRoutes);
      },
      [] as Router.Route[]
    );

    routes.forEach(({ method, path, opts, handlers }) => {
      const params = [];
      let j = 0;

      for (let i = 0, len = path.length; i < len; i++)
        // search for parametric or wildcard routes
        // parametric route
        if (path.charCodeAt(i) === 58) {
          let nodeType = NODE_TYPES.PARAM;
          let staticPart = path.slice(0, i);
          j = i + 1;

          if (!this.caseSensitive) staticPart = staticPart.toLowerCase();

          // add the static part of the route to the tree
          this._insert(method, staticPart, 0, undefined, undefined, null);

          // isolate the parameter name
          let isRegex = false;
          while (i < len && path.charCodeAt(i) !== 47) {
            isRegex = isRegex || path[i] === "(";

            if (isRegex) {
              i = getClosingParenthensePosition(path, i) + 1;
              break;
            } else if (path.charCodeAt(i) !== 45) i++;
            else break;
          }

          if (isRegex && (i === len || path.charCodeAt(i) === 47)) nodeType = NODE_TYPES.REGEX;
          else if (i < len && path.charCodeAt(i) !== 47) nodeType = NODE_TYPES.MULTI_PARAM;

          const parameter = path.slice(j, i);
          let regex: any = isRegex ? parameter.slice(parameter.indexOf("("), i) : null;

          if (isRegex) {
            regex = new RegExp(regex);

            if (!this.allowUnsafeRegex) assert(isRegexSafe(regex), `The regex "${regex.toString()}" is not safe!`);
          }

          params.push(parameter.slice(0, isRegex ? parameter.indexOf("(") : i));

          path = path.slice(0, j) + path.slice(i);
          i = j;
          len = path.length;

          // if the path is ended
          if (i === len)
            return this._insert(method, path.slice(0, i), nodeType, params, handlers, regex);

          // add the parameter and continue with the search
          this._insert(method, path.slice(0, i), nodeType, params, undefined, regex);

          i--;
          // wildcard route
        } else if (path.charCodeAt(i) === 42) {
          this._insert(method, path.slice(0, i), NODE_TYPES.STATIC, undefined, undefined, null);
          // add the wildcard parameter
          params.push("*");
          return this._insert(method, path.slice(0, len), NODE_TYPES.MATCH_ALL, params, handlers, null);
        }

      if (!this.caseSensitive) path = path.toLowerCase();

      // static route
      return this._insert(method, path, NODE_TYPES.STATIC, params, handlers, null);
    });

    return this;
  }

  on(
    method: Method | Method[], path: string, opts: Layer.RouteOptions | Layer.Handler,
    ...handlers: Layer.Handler[]
  ) {
    if (utils.function.isFunction(opts)) {
      handlers = [opts].concat(handlers);
      opts = {};
    }

    // path validation
    assert(typeof path === "string", "Path should be a string");
    assert(path.length > 0, "The path could not be empty");
    assert(path[0] === "/" || path[0] === "*", "The first character of a path should be `/` or `*`");
    // handler validation
    handlers.forEach((handler) => assert(typeof handler === "function", "Handler should be a function"));

    return this._on(method, path, opts, handlers);
  }

  route(path: string): Router.PathMethods<Router.PathMethods> {
    const ROUTE = httpMethods.reduce((prev, method) => {
      const methodName = method.toLowerCase();

      if (prev[methodName]) throw new Error(`Method already exists: ${methodName}`);

      prev[methodName] = (opts: Layer.RouteOptions | Layer.Handler, ...handlers: Layer.Handler[]) => {
        this.on(method, path, opts, ...handlers);

        return ROUTE;
      };

      return prev;
    }, {} as any);

    return ROUTE;
  }

  use(path: string | Layer.Handler, ...handlers: Layer.Handler[]) {
    if (utils.function.isFunction(path)) {
      handlers = [path].concat(handlers);
      path = "*";
    }

    // path validation
    assert(typeof path === "string", "Path should be a string");
    assert(path.length > 0, "The path could not be empty");
    assert(path[0] === "/" || path[0] === "*", "The first character of a path should be `/` or `*`");
    // handler validation
    handlers.forEach((handler) => assert(typeof handler === "function", "Handler should be a function"));

    this.middlewares.push({ path, handlers });

    return this;
  }

  reset() {
    this.tree = new Layer();
    this.routes = [];

    return this;
  }

  // TODO: remove this
  off(method: Method | Method[], path: string) {
    if (Array.isArray(method)) {
      method.forEach((method) => this.off(method, path));

      return this;
    }

    // method validation
    assert(typeof method === "string", "Method should be a string");
    assert(httpMethods.indexOf(method) !== -1, `Method "${method}" is not an http method.`);
    // path validation
    assert(typeof path === "string", "Path should be a string");
    assert(path.length > 0, "The path could not be empty");
    assert(path[0] === "/" || path[0] === "*", "The first character of a path should be `/` or `*`");

    // Rebuild tree without the specific route
    const ignoreTrailingSlash = this.ignoreTrailingSlash;
    let newRoutes = this.routes.filter((route) => {
      if (!ignoreTrailingSlash)
        return !(method === route.method && path === route.path);

      if (path.endsWith("/")) {
        const routeMatches = path === route.path || path.slice(0, -1) === route.path;

        return !(method === route.method && routeMatches);
      }

      const routeMatches = path === route.path || `${path}/` === route.path;

      return !(method === route.method && routeMatches);
    });

    if (ignoreTrailingSlash)
      newRoutes = newRoutes.filter((route, i, ar) => {
        if (route.path.endsWith("/") && i < ar.length - 1)
          return route.path.slice(0, -1) !== ar[i + 1].path;
        else if (route.path.endsWith("/") === false && i < ar.length - 1)
          return `${route.path}/` !== ar[i + 1].path;

        return true;
      });

    this.reset();

    newRoutes.forEach((route) => this.on(route.method, route.path, route.opts, ...route.handlers));

    return this;
  }

  lookup(req: Request, res: Response) {
    // const handle = this.find(req.method as Method, sanitizeUrl(req.path));
    const handle = this.find(req.method as Method, sanitizeUrl(req.url as string));
    // const schema = handle.options.schema;

    // console.log(handle);

    // res.stringify = schema && schema.response;

    req.params = handle.params;

    this._safeNext.run(req, res, handle.handlers);
  }

  find(method: Method, path: string) {
    if (!this.caseSensitive) path = path.toLowerCase();

    const maxParamLength = this.maxParamLength;
    let currentNode = this.tree;
    let wildcardNode = null;
    let pathLenWildcard = 0;
    const originalPath = path;
    let decoded = null;
    let pindex = 0;
    const params = [];
    let i = 0;

    while (true) {
      let pathLen = path.length;
      const prefix = currentNode.prefix;
      const prefixLen = prefix.length;
      let len = 0;
      const previousPath = path;

      // found the route
      if (pathLen === 0 || path === prefix) {
        const handle = currentNode.getHandler(method);

        if (handle.handlers.length > 0) {
          const paramsObj: any = {};

          if (handle.paramsLength > 0) {
            const paramNames = handle.params;

            for (i = 0; i < handle.paramsLength; i++)
              paramsObj[paramNames[i]] = params[i];
          }

          return {
            handlers: handle.handlers,
            params: paramsObj,
          };
        }
      }

      // search for the longest common prefix
      i = pathLen < prefixLen ? pathLen : prefixLen;
      while (len < i && path.charCodeAt(len) === prefix.charCodeAt(len)) len++;

      if (len === prefixLen) {
        path = path.slice(len);
        pathLen = path.length;
      }

      let node = currentNode.findChild(path, method);

      if (node === null) {
        node = currentNode.parametricBrother;

        if (node === null)
          return getWildcardNode(wildcardNode, method, originalPath, pathLenWildcard);

        path = previousPath;
        pathLen = previousPath.length;
        len = prefixLen;
      }

      const kind = node.kind;

      // static route
      if (kind === NODE_TYPES.STATIC) {
        // if exist, save the wildcard child
        if (currentNode.wildcardChild !== null) {
          wildcardNode = currentNode.wildcardChild;
          pathLenWildcard = pathLen;
        }

        currentNode = node;
        continue;
      }

      if (len !== prefixLen)
        return getWildcardNode(wildcardNode, method, originalPath, pathLenWildcard);

      // if exist, save the wildcard child
      if (currentNode.wildcardChild !== null) {
        wildcardNode = currentNode.wildcardChild;
        pathLenWildcard = pathLen;
      }

      // parametric route
      if (kind === NODE_TYPES.PARAM) {
        currentNode = node;
        i = path.indexOf("/");

        if (i === -1) i = pathLen;

        if (i > maxParamLength) return EMPTY_HANDLE;

        decoded = fastDecode(path.slice(0, i));

        if (decoded === null) return EMPTY_HANDLE;

        params[pindex++] = decoded;
        path = path.slice(i);

        continue;
      }

      // wildcard route
      if (kind === NODE_TYPES.MATCH_ALL) {
        decoded = fastDecode(path);

        if (decoded === null) return EMPTY_HANDLE;

        params[pindex] = decoded;
        currentNode = node;
        path = "";

        continue;
      }

      // parametric(regex) route
      if (kind === NODE_TYPES.REGEX) {
        currentNode = node;
        i = path.indexOf("/");

        if (i === -1) i = pathLen;

        if (i > maxParamLength) return EMPTY_HANDLE;

        decoded = fastDecode(path.slice(0, i));

        if (decoded === null) return EMPTY_HANDLE;

        if (!(node.regex as RegExp).test(decoded)) return EMPTY_HANDLE;

        params[pindex++] = decoded;
        path = path.slice(i);

        continue;
      }

      // multiparametric route
      if (kind === NODE_TYPES.MULTI_PARAM) {
        currentNode = node;
        i = 0;

        if (node.regex !== null) {
          const matchedParameter = path.match(node.regex);

          if (matchedParameter === null) return EMPTY_HANDLE;

          i = matchedParameter[1].length;
        } else {
          while (i < pathLen && path.charCodeAt(i) !== 47 && path.charCodeAt(i) !== 45) i++;
          if (i > maxParamLength) return EMPTY_HANDLE;
        }

        decoded = fastDecode(path.slice(0, i));

        if (decoded === null) return EMPTY_HANDLE;

        params[pindex++] = decoded;
        path = path.slice(i);

        continue;
      }

      wildcardNode = null;
    }
  }

  prettyPrint() {
    return this.tree.prettyPrint("", true);
  }

  all(path: string, ...handlers: Layer.Handler[]) {
    return this.on.apply(this, [httpMethods, path, ...handlers]);
  }
}

export = Router;

const router = new Router();

// const schema: Layer.Schema = {
//   response: {
//     200: {
//       type: "object",
//       properties: {
//         hello: {
//           type: "string",
//         },
//       },
//     },
//   },
// };

// router.route("/")
//   .get({ schema }, (req, res) => res.end(JSON.stringify({ hello: "world" })));

router
  .use((req, res, next) => {
    (req.params as any).middleware = true;

    next();
  })
  .get("/test", (req, res, next) => {
    (req as any).test = 1;

    next();
  }, (req, res) => res.end(JSON.stringify({ hello: "world", test: (req as any).test, params: req.params })))
  .get("/:test", (req, res) => res.end(JSON.stringify(req.params)))
  .get("/text/hello", (req, res) => res.end(JSON.stringify({ hello: "world" })))
  .initialize(new Foxify());

console.log(router.prettyPrint());

http.createServer((req, res) => {
  router.lookup(req as any, res as any);
}).listen(3000, (err: any) => {
  if (err) throw err;
  console.log("Server listening on: http://localhost:3000");
});
