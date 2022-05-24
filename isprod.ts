export function isProd(): boolean {
  return Deno.env.get('ENVIRONMENT') === 'production'
}
