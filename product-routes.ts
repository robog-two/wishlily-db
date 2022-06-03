import { Router } from 'https://deno.land/x/oak@v10.6.0/mod.ts'
import { MongoClient, Bson } from 'https://deno.land/x/mongo@v0.30.0/mod.ts'

export function routes(router: Router, mongo: MongoClient): void {
  router.post('/add_item_to_wishlist', async (ctx) => {
    const json = await ctx.request.body({type: 'json', limit: 0}).value

    const wishlistId = json.wishlistId.toString()
    if (!wishlistId.match(/^[a-f\d]{24}$/i)) {
      throw new Error('Wishlist ID failed to validate')
    }

    const wishlistObj = await mongo.database('wishlily').collection('user_wishlists').findOne({
      _id: new Bson.ObjectId(wishlistId.toString())
    })

    if (wishlistObj?.userId === undefined) {
      throw new Error('Wishlist does not exist!')
    }

    const userId = json.userId.toString()
    // Matches a UUID but NOT the nil UUID
    if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      throw new Error('User ID failed to validate')
    }

    let embed

    try {
      embed = await (await fetch(`${Deno.env.get('ENVIRONMENT') === 'production' ? 'https://proxy.wishlily.app' : 'http://localhost:8080'}/generic/product?id=${encodeURIComponent(json.link)}`)).json()
    } catch (e) {
      console.log(e)
    }

    if (!embed.success || embed.isSearch) {
      embed.link = undefined
      embed.title = undefined
    }

    const cover = embed.cover

    const link = embed.link ?? json.link

    const title = embed.title ?? json.link
    const price = embed.price

    const userKey = (await mongo.database('wishlily').collection('users').findOne({
      userId
    }))?.['userKey']

    if (userKey !== json.userKey || userKey === undefined) {
      throw new Error('User Key does not match!')
    }

    const oid = (await mongo.database('wishlily').collection(`wishes`).insertOne({
      userId,
      wishlistId,
      cover,
      title,
      price,
      link
    }))

    ctx.response.status = 200
    ctx.response.body = { embed: { id: oid.toString(), cover, title, price, link }, success: true}
  })

  router.post('/delete_item_from_wishlist', async (ctx) => {
    const json = await ctx.request.body({type: 'json', limit: 0}).value

    const wishlistId = json.wishlistId.toString()
    if (!wishlistId.match(/^[a-f\d]{24}$/i)) {
      throw new Error('Wishlist ID failed to validate')
    }

    const wishlistObj = await mongo.database('wishlily').collection('user_wishlists').findOne({
      _id: new Bson.ObjectId(wishlistId.toString())
    })

    if (wishlistObj?.userId === undefined) {
      throw new Error('Wishlist does not exist!')
    }

    const userId = json.userId.toString()
    // Matches a UUID but NOT the nil UUID
    if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      throw new Error('User ID failed to validate')
    }

    const userKey = (await mongo.database('wishlily').collection('users').findOne({
      userId
    }))?.['userKey']

    if (userKey !== json.userKey.toString() || userKey === undefined) {
      throw new Error('User Key does not match!')
    }

    if (!json.id) {
      throw new Error('Must provide product ID to delete')
    }

    await mongo.database('wishlily').collection(`wishes`).deleteOne({
      userId,
      wishlistId,
      _id: new Bson.ObjectId(json.id.toString())
    })

    ctx.response.status = 200
    ctx.response.body = {success: true}
  })

  router.post('/list_products_in_wishlist', async (ctx) => {
    const json = await ctx.request.body({type: 'json', limit: 0}).value

    const wishlistId = json.wishlistId.toString()
    if (!wishlistId.match(/^[a-f\d]{24}$/i)) {
      throw new Error('Wishlist ID failed to validate')
    }

    const wishlistObj = await mongo.database('wishlily').collection('user_wishlists').findOne({
      _id: new Bson.ObjectId(wishlistId.toString())
    })

    if (wishlistObj?.userId === undefined) {
      throw new Error('Wishlist does not exist!')
    }

    const userId = json.userId.toString()
    // Matches a UUID but NOT the nil UUID
    if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      throw new Error('User ID failed to validate')
    }

    try {
      let proxiedResults: Object[] = []
      await (await(await mongo.database('wishlily').collection(`wishes`).find({
        userId,
        wishlistId
      })).toArray()).forEach(doc => {
        proxiedResults.push({
          title: doc.title,
          price: doc.price,
          cover: doc.cover,
          link: doc.link,
          id: doc._id.toString()
        })
      })

      ctx.response.status = 200
      ctx.response.body = proxiedResults ?? []
    } catch (e) {
      ctx.response.status = 200
      ctx.response.body = []
    }
  })
}
