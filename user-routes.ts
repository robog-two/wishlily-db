import { Router } from 'https://deno.land/x/oak@v10.6.0/mod.ts'
import { MongoClient, Bson } from 'https://deno.land/x/mongo@v0.30.0/mod.ts'

export function routes(router: Router, mongo: MongoClient): void {
  router.post('/confirm_user', async (ctx) => {
    const json = await ctx.request.body({type: 'json', limit: 0}).value

    const userId = json.userId.toString()
    // Matches a UUID but NOT the nil UUID
    if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      throw new Error('User ID failed to validate')
    }

    const user = await mongo.database('wishlily').collection('users').findOne({ userId })

    if (!user) throw new Error('User ID not found.')

    if (user.userKey !== json.userKey) throw new Error('Test authentication failed. You\'ve got the wrong key!')

    ctx.response.status = 200
    ctx.response.body = {success: true}
  })

  router.post('/create_user', async (ctx) => {
    const json = await ctx.request.body({type: 'json', limit: 0}).value

    const userId = json.userId.toString()
    // Matches a UUID but NOT the nil UUID
    if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      throw new Error('User ID failed to validate')
    }

    if (await mongo.database('wishlily').collection('users').findOne({ userId })) {
      throw new Error('That user already exists!')
    }

    await mongo.database('wishlily').collection(`users`).insertOne({
      userId,
      userKey: json.userKey.toString().substr(0,4096)
    });

    ctx.response.status = 200
    ctx.response.body = {success: true}
  })

  router.post('/delete_user', async (ctx) => {
    const json = await ctx.request.body({type: 'json', limit: 0}).value

    const userId = json.userId.toString()
    // Matches a UUID but NOT the nil UUID
    if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      throw new Error('User ID failed to validate')
    }

    const userKey = json.userKey.toString()

    const user = await mongo.database('wishlily').collection('users').findOne({ userId })

    if (!user) throw new Error('User ID not found.')

    if (user.userKey !== userKey) throw new Error('Test authentication failed. You\'ve got the wrong key!')

    await mongo.database('wishlily').collection('users').deleteOne({
      userId,
      userKey
    })

    ctx.response.status = 200
    ctx.response.body = {success: true}
  })

  router.post('/list_wishlists', async (ctx) => {
    const json = await ctx.request.body({type: 'json', limit: 0}).value

    const userId = json.userId.toString()
    // Matches a UUID but NOT the nil UUID
    if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      throw new Error('User ID failed to validate')
    }

    const userKey = (await mongo.database('wishlily').collection('users').findOne({
      userId
    }))?.['userKey']

    if (userKey !== json.userKey) {
      throw new Error('User Key does not match!')
    }

    let proxiedResults: Object[] = []
    await (await(await mongo.database('wishlily').collection(`user_wishlists`).find({
      userId
    })).toArray()).forEach(doc => {
      proxiedResults.push({
        title: doc.title,
        id: doc._id.toString(),
        color: doc.color,
        address: doc.address
      })
    })

    ctx.response.status = 200
    ctx.response.body = proxiedResults
  })
}
