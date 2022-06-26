import { Router } from 'https://deno.land/x/oak@v10.6.0/mod.ts'
import { MongoClient, Bson } from 'https://deno.land/x/mongo@v0.30.0/mod.ts'

export function routes(router: Router, mongo: MongoClient): void {
  router.post('/create_wishlist', async (ctx) => {
    try {
      const json = await ctx.request.body({type: 'json', limit: 0}).value

      const userId = json.userId.toString()
      // Matches a UUID but NOT the nil UUID
      if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
        throw new Error('User ID failed to validate')
      }

      const userKey = (await mongo.database('wishlily').collection('users').findOne({
        userId
      }))?.['userKey']

      if (userKey !== json.userKey || userKey === undefined) {
        throw new Error('User Key does not match!')
      }

      if (!json.title) throw new Error('Title is required.')

      const color = json?.color?.toString() ?? '#ffffff'
      if (!color.match(/^#([0-9a-f]{3}){1,2}$/i)) {
        throw new Error('color must be a valid hex color')
      }

      if (json.title.toString().length > 2048) {
        throw new Error('Title too long.')
      }

      if (json.address !== undefined && json.address.toString().length > 8192) {
        throw new Error('Address too long.')
      }

      const address = json.address === undefined ? undefined : json.address.toString().substr(0, 8192)

      if (address !== undefined && !address.match(/client_side_enc,[A-Fa-f0-9]*,[A-Fa-f0-9]{32}/i)) {
        throw new Error('Encryption failed. (field: address)')
      }

      const title = json.title.toString().substr(0, 2048)

      if (title === undefined || !title.match(/client_side_enc,[A-Fa-f0-9]*,[A-Fa-f0-9]{32}/i)) {
        throw new Error('Encryption failed. (field: title)')
      }

      const listLength = (await mongo.database('wishlily').collection('user_wishlists').find({
        userId,
      }).toArray()).length

      if (listLength >= 6) {
        // TODO: future subscription for addl storage?
        ctx.response.body = {
          message: 'Only 6 wishlists allowed per user. May increase in the future.',
          success: false
        }
        ctx.response.status = 500
        return
      }

      const wishlist = (await mongo.database('wishlily').collection(`user_wishlists`).insertOne({
          userId,
          title,
          address,
          color
      }))

      ctx.response.status = 200
      ctx.response.body = { wishlist: { id: wishlist.toString(), color, title, address }, success: true}
    } catch (e) {
      ctx.response.status = 500
      ctx.response.body = e.message
      return
    }
  })

  router.post('/delete_wishlist', async (ctx) => {
    const json = await ctx.request.body({type: 'json', limit: 0}).value

    const wishlistId = json.wishlistId.toString()
    if (!wishlistId.match(/^[a-f\d]{24}$/i)) {
      throw new Error('Wishlist ID failed to validate')
    }

    const userId = json.userId.toString()
    // Matches a UUID but NOT the nil UUID
    if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      throw new Error('User ID failed to validate')
    }

    const userKey = (await mongo.database('wishlily').collection('users').findOne({
      userId
    }))?.['userKey']

    if (userKey !== json.userKey || userKey === undefined) {
      throw new Error('User Key does not match!')
    }

    await mongo.database('wishlily').collection(`wishes`).deleteMany({
      userId,
      wishlistId
    })

    await mongo.database('wishlily').collection(`user_wishlists`).deleteOne({
      userId,
      _id: new Bson.ObjectId(wishlistId)
    })

    ctx.response.status = 200
    ctx.response.body = {success: true}
  })

  router.post('/edit_wishlist', async (ctx) => {
    const json = await ctx.request.body({type: 'json', limit: 0}).value

    const userId = json.userId.toString()
    // Matches a UUID but NOT the nil UUID
    if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      throw new Error('User ID failed to validate')
    }

    const userKey = (await mongo.database('wishlily').collection('users').findOne({
      userId
    }))?.['userKey']

    if (userKey !== json.userKey || userKey === undefined) {
      throw new Error('User Key does not match!')
    }

    if (!json.title) throw new Error('Title is required.')

    const color = json?.color?.toString() ?? '#ffffff'
    if (!color.match(/^#([0-9a-f]{3}){1,2}$/i)) {
      throw new Error('color must be a valid hex color')
    }

    if (json.title.toString().length > 2048) {
      throw new Error('Title too long.')
    }

    if (json.address !== undefined && json.address.toString().length > 8192) {
      throw new Error('Address too long.')
    }

    const address = json.address === undefined ? undefined : json.address.toString().substr(0, 8192)

    if (address !== undefined && !address.match(/client_side_enc,[A-Fa-f0-9]*,[A-Fa-f0-9]{32}/i)) {
      throw new Error('Encryption failed. (field: address)')
    }

    const title = json.title.toString().substr(0, 2048)

    if (title === undefined || !title.match(/client_side_enc,[A-Fa-f0-9]*,[A-Fa-f0-9]{32}/i)) {
      throw new Error('Encryption failed. (field: title)')
    }

    if (json.id === undefined) {
      throw new Error('Wishlist ID to edit is required')
    }

    await mongo.database('wishlily').collection(`user_wishlists`).updateOne(
      {
        _id: new Bson.ObjectId(json.id.toString()),
        userId,
      },
      {
        $set: {
          title,
          address,
          color
        }
      },
      {
        upsert: false
      }
    )

    ctx.response.status = 200
    ctx.response.body = {success: true}
  })

  router.post('/get_wishlist_info', async (ctx) => {
    const json = await ctx.request.body({type: 'json', limit: 0}).value

    const wishlistId = json.wishlistId.toString()
    if (!wishlistId.match(/^[a-f\d]{24}$/i)) {
      throw new Error('Wishlist ID failed to validate')
    }

    const wishlistObj = await mongo.database('wishlily').collection('user_wishlists').findOne({
      '_id': new Bson.ObjectId(wishlistId.toString())
    })

    if (wishlistObj?.userId === undefined) {
      throw new Error('Wishlist does not exist!')
    }

    const userId = json.userId.toString()
    // Matches a UUID but NOT the nil UUID
    if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      throw new Error('User ID failed to validate')
    }

    let doc = await mongo.database('wishlily').collection(`user_wishlists`).findOne({
      userId,
      '_id': new Bson.ObjectId(wishlistId)
    })

    ctx.response.status = 200
    ctx.response.body = {
      title: doc?.title,
      address: doc?.address,
      color: doc?.color,
      version: doc?.version,
    }
  })
}
