import * as cluster from "cluster";
import * as http from "http";
import * as https from "https";
import Foxify from ".";
import Request, {
  createConstructor as createRequestConstructor,
} from "./Request";
import Response, {
  createConstructor as createResponseConstructor,
} from "./Response";
import { Engine } from "./view";

namespace Server {
  export interface Settings extends Foxify.Settings {
    view?: Engine;
  }

  export type Listener = (request: Request, response: Response) => void;

  export type Callback = (server: Server) => void;
}

class Server {
  protected _host: string;
  protected _port: number;

  protected _listening = false;

  private _instance?: http.Server | https.Server;

  constructor(settings: Server.Settings, listener: Server.Listener) {
    this._host = settings.url;
    this._port = settings.port;

    const isHttps = settings.https;
    const SERVER: any = isHttps ? https : http;

    const IncomingMessage = createRequestConstructor(settings);
    const ServerResponse = createResponseConstructor(settings);

    const OPTIONS: any = { IncomingMessage, ServerResponse };

    if (isHttps) {
      OPTIONS.cert = settings["https.cert"];
      OPTIONS.key = settings["https.key"];
    }

    const workers = settings.workers;

    if (workers > 1) {
      if (cluster.isMaster) {
        for (let i = 0; i < workers; i++) cluster.fork();

        return this;
      }

      this._instance = SERVER.createServer(OPTIONS, listener);

      return this;
    }

    this._instance = SERVER.createServer(OPTIONS, listener);
  }

  public get listening() {
    return this._listening;
  }

  public start(callback?: Server.Callback) {
    this._listening = true;

    const instance = this._instance;

    if (instance) {
      instance.listen(
        this._port,
        this._host,
        callback && (() => callback(this)),
      );
    }

    return this;
  }

  public stop(callback?: Server.Callback) {
    this._listening = false;

    const instance = this._instance;

    if (instance) instance.close(callback && (() => callback(this)));

    return this;
  }

  public reload(callback?: Server.Callback) {
    if (this._listening) return this.stop(server => server.start(callback));

    return this.start(callback);
  }
}

export = Server;
