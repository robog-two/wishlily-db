import { Router } from 'https://deno.land/x/oak@v10.6.0/mod.ts'
import { MongoClient, Bson } from 'https://deno.land/x/mongo@v0.30.0/mod.ts'
import { domain } from './isprod.ts'

const sockets: Record<string, Array<WebSocket>> = {}

interface Embed {
  id: string,
  embed: Object
}

export function routes(router: Router, mongo: MongoClient): void {
  async function sendEach(message: any, userId: string, wishlistId: string) {
    console.log(`⬆ ${message?.action}`)
    const idString = userId + '+' + wishlistId
    sockets[idString]?.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message))
      } else {
        socket.addEventListener('open', () => {
          socket.send(JSON.stringify(message))
        })
      }
    })
  }

  async function upgrade(userId: string, wishlistId: string, wishId: string) {
    const wishCollection = mongo.database('wishlily').collection('wishes')
    const wish = await wishCollection.findOne({ _id: new Bson.ObjectId(wishId), wishlistId: wishlistId })

    if (wish) {
      const url = `${await domain('mathilda')}/generic/product?id=${encodeURIComponent(wish?.link.replaceAll('}', ''))}`
      const embed = await (await fetch(url)).json()
      if (embed.title != wish.title || embed.link != wish.link || embed.price != wish.price || embed.cover != wish.cover) {
        wishCollection.updateOne({ _id: new Bson.ObjectId(wishId) }, {
          $set: { ...embed }
        })
        sendEach({ action: 'replace-embed', embed: { id: wishId, ...embed }}, userId, wishlistId)
      }
    }
  }

  async function processMessage(rawMessage: string, socket: WebSocket) {
    try {
      const message = JSON.parse(rawMessage)
      console.log(`⬇ ${message?.action}`)
      switch (message.action) {
        case 'reload':
          sendEach({ action: 'reload' }, message.userId, message.wishlistId)
          break;
        case 'register':
          const idString = message.userId + '+' + message.wishlistId
          if (sockets[idString] === undefined) sockets[idString] = []
          sockets[idString].push(socket)
          break;
        case 'upgrade':
          await upgrade(message.userId, message.wishlistId, message.wishId)
          break;
      }
    } catch (e) {
      console.log(e)
    }
  }

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
