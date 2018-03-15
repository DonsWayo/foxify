import * as http from "http";
import { Encapsulation } from "../exeptions";
import httpMethods from "./httpMethods";

declare module Route {
  type Controller =
    (
      requset: http.IncomingMessage,
      response: http.ServerResponse,
      next: () => void,
      ...rest: any[],
    ) => void;

  export interface Routes {
    [method: string]: RouteObject[];
  }

  export interface RouteObject {
    path: string | RegExp;
    controller: Encapsulation;
  }
}

declare interface Route {
  [key: string]: any;
}

class Route {
  routes: Route.Routes = {};

  protected _prefix: string;

  constructor(prefix: string = "") {
    this._prefix = prefix;

    httpMethods.map((method) => {
      this.routes[method] = [];

      this[method.toLowerCase()] = (path: string, controller: Route.Controller) => this._push(method, path, controller);
    });
  }

  protected _push(method: string, path: string, controller: Route.Controller) {
    path = `${this._prefix}${path}`.replace(/\/$/, "");

    this.routes[method].push({
      path,
      controller: new Encapsulation(
        (req, res, next: () => void, ...args: any[],
        ) => controller(req, res, next, ...args)),
    });

    return this;
  }

  any(path: string, controller: Route.Controller) {
    httpMethods.map((method) => this._push(method, path, controller));

    return this;
  }

  oneOf(methods: string[], path: string, controller: Route.Controller) {
    methods.map((method) => this._push(method.toUpperCase(), path, controller));

    return this;
  }

  /**
   *
   * @param {Function|String|Route} [first=(function())]
   * @param {Function} [second=(function())]
   */
  use(first: Route.Controller | string | Route = () => { }, second: Route.Controller = () => { }) {
    if (first instanceof Route) {
      const _routes = first.routes;

      httpMethods.map((method) => this._routes[method].push(..._routes[method]));
    } else {
      let _path = "(.*)";
      let _middleware = first;

      if (String.isInstance(first)) {
        _path = `${first}${_path}`;
        _middleware = second;
      }

      this.any(_path, <Route.Controller> _middleware);
    }

    return this;
  }
}

export = Route;
