import { Application, Router, Status } from 'https://deno.land/x/oak@v10.5.1/mod.ts'
import { CORS } from 'https://deno.land/x/oak_cors@v0.1.0/mod.ts'
import { config } from 'https://deno.land/x/dotenv@v3.2.0/mod.ts'
import { isProd } from './isprod.ts'
import { connect } from './mongo.ts'
import { MongoClient, Bson } from "https://deno.land/x/mongo@v0.30.0/mod.ts"

if (!isProd()) {
  let envs = config({})
  for (const env in envs) {
    Deno.env.set(env, envs[env])
  }
}

const mongo = await connect()

console.log(await mongo.database('wishlily').listCollectionNames())

const router = new Router()

router.post('/add_item_to_wishlist', async (ctx) => {
  const json = await ctx.request.body({type: 'json'}).value

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

  const embed = await (await fetch(`${Deno.env.get('ENVIRONMENT') === 'production' ? 'https://proxy.wishlily.app' : 'http://localhost:8080'}/generic/product?id=${encodeURIComponent(json.link)})`)).json()

  console.log(embed)

  const cover = `https://imagecdn.app/v2/image/${encodeURIComponent(embed.cover)}?width=400&height=200&format=webp&fit=cover`

  const link = embed.link

  const title = embed.title
  const price = embed.price

  const userKey = (await mongo.database('wishlily').collection('users').findOne({
    userId
  }))?.['userKey']

  if (userKey !== json.userKey || userKey === undefined) {
    throw new Error('User Key does not match!')
  }

  const doc = (await mongo.database('wishlily').collection(`wishes`).insertOne({
    userId,
    wishlistId,
    cover,
    title,
    price,
    link
  }))

  ctx.response.status = 200
  ctx.response.body = { embed: doc, success: true}
})

router.post('/confirm_user', async (ctx) => {
  const json = await ctx.request.body({type: 'json'}).value

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
  const json = await ctx.request.body({type: 'json'}).value

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

router.post('/create_wishlist', async (ctx) => {
  const json = await ctx.request.body({type: 'json'}).value

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

  const wishlist = (await mongo.database('wishlily').collection(`user_wishlists`).insertOne({
      userId,
      title,
      address,
      color
  }))

  ctx.response.status = 200
  ctx.response.body = { wishlist, success: true}
})

router.post('/delete_item_from_wishlist', async (ctx) => {
  const json = await ctx.request.body({type: 'json'}).value

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

router.post('/delete_user', async (ctx) => {
  const json = await ctx.request.body({type: 'json'}).value

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

router.post('/delete_wishlist', async (ctx) => {
  const json = await ctx.request.body({type: 'json'}).value

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
  const json = await ctx.request.body({type: 'json'}).value

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
  const json = await ctx.request.body({type: 'json'}).value

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

  let doc = await mongo.database('wishlily').collection(`user_wishlists`).findOne({
    userId,
    _id: new Bson.ObjectId(wishlistId)
  })

  ctx.response.status = 200
  ctx.response.body = {
    title: doc?.title,
    address: doc?.address,
    color: doc?.color
  }
})

router.post('/list_wishlist', async (ctx) => {
  const json = await ctx.request.body({type: 'json'}).value

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
  ctx.response.body = proxiedResults
})

router.post('/list_wishlists', async (ctx) => {
  const json = await ctx.request.body({type: 'json'}).value

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


router.get('/', async (ctx) => {
  ctx.response.status = 200
  ctx.response.body = {
    message: '👒 WishLily Database API. https://wishlily.app/',
    success: true,
    env: (Deno.env.get('ENVIRONMENT') === 'production' ? undefined : Deno.env.get('ENVIRONMENT'))
  }
})

const app = new Application()
app.use(CORS({origin: '*'}))
app.use(router.routes())
app.use(router.allowedMethods())

app.addEventListener(
  'listen',
  (_) => console.log('Listening on http://localhost:8081'),
)
await app.listen({ port: 8081 })
