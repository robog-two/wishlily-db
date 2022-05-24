import { Application, Router, Status } from 'https://deno.land/x/oak@v10.5.1/mod.ts'
import { CORS } from 'https://deno.land/x/oak_cors@v0.1.0/mod.ts';

const router = new Router()

router.get('/', async (req) => {
  return {
    message: '👒 WishLily Database API. https://wishlily.app/',
    success: true
  }
})

const app = new Application()
app.use(CORS({origin: (Deno.env.get('ENVIRONMENT') === 'production' ? 'wishlily.app' : '*')}))
app.use(router.routes())
app.use(router.allowedMethods())

app.addEventListener(
  'listen',
  (_) => console.log('Listening on http://localhost:8081'),
)
await app.listen({ port: 8081 })
