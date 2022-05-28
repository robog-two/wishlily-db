import { Router } from 'https://deno.land/x/oak@v10.6.0/mod.ts'
import { MongoClient } from 'https://deno.land/x/mongo@v0.30.0/mod.ts'

const sockets: Record<string, Array<WebSocket>> = {}

async function processMessage(rawMessage: string, socket: WebSocket) {
  const message = rawMessage.split('|')
  console.log(rawMessage)
  switch (message[1]) {
    case 'reload':
      await sockets[message[0]]?.forEach(socket => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send('reload')
        } else {
          socket.addEventListener('open', () => {
            socket.send('reload')
          })
        }
      })
      break;
    case 'register':
      if (sockets[message[0]] === undefined) sockets[message[0]] = []
      sockets[message[0]].push(socket)
      break;
  }
}

export function routes(router: Router, mongo: MongoClient): void {
  router.get('/product-update-websocket', async (ctx) => {
    if (ctx.isUpgradable) {
      const socket = await ctx.upgrade()
      socket.addEventListener('message', async (event) => {
        await processMessage(event.data, socket)
      })
    } else {
      ctx.response.status = 500
      ctx.response.body = {
        message: 'This is a websocket endpoint. Please use a websocket client.',
        success: false
      }
    }
  })
}
