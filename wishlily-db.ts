import { Application, Router, Status } from 'https://deno.land/x/oak@v10.6.0/mod.ts'
import { CORS } from 'https://deno.land/x/oak_cors@v0.1.1/mod.ts'
import { config } from 'https://deno.land/x/dotenv@v3.2.0/mod.ts'
import { isProd } from './isprod.ts'
import { connect } from './mongo.ts'
import { MongoClient, Bson } from 'https://deno.land/x/mongo@v0.30.0/mod.ts'
import { routes as wishlistRoutes } from './wishlist-routes.ts'
import { routes as userRoutes } from './user-routes.ts'
import { routes as productRoutes } from './product-routes.ts'
import { routes as websocketRoutes } from './websocket-routes.ts'

if (!isProd()) {
  config({})
}

const router = new Router()
const mongo = await connect()

wishlistRoutes(router, mongo)
userRoutes(router, mongo)
productRoutes(router, mongo)
websocketRoutes(router, mongo)

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
if (Deno.env.get('ENVIRONMENT') !== 'PRODUCTION') {
  app.use(async (ctx, next) => {
    const body = ctx.request.hasBody ? await ctx.request.body({type: 'json', limit: 0}).value : undefined
    await next()
    console.log('Request:')
    console.log(ctx.request.method + ' ' + ctx.request.url)
    console.log(body)
    console.log('Response:')
    console.log(ctx.response.body)
  })
}

app.use(router.routes())
app.use(router.allowedMethods())

app.addEventListener(
  'listen',
  (_) => console.log('Listening on http://localhost:8081'),
)
await app.listen({ port: 8081 })
