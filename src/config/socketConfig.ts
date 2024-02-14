import { Server } from 'socket.io'
import http from 'http'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class IoServer {
  static io: Server

  static setServer(server: http.Server): Server {
    const ioServer = new Server(server, {
      cors: {
        origin: 'http://localhost:3000',
      },
    })

    this.io = ioServer
    return this.io
  }
}
