import fastify from "fastify"
import {type TypeBoxTypeProvider} from "@fastify/type-provider-typebox"
import { fastifyJwt } from "@fastify/jwt"
import { RotaAuth } from "./routes/AuthUsuario"
import { LiveKit } from "./routes/LiveKit"
import oauth2 from "@fastify/oauth2"
import { fastifyCookie } from "@fastify/cookie"
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import { AuthDiscord } from "./routes/AuthDiscord"
import fastifyWebsocket from "@fastify/websocket"
import { RotasServidor } from "./routes/Servidor"
import { routeWebSocket } from "./routes/WebSocketMain"
import { routeHook } from "./routes/WebHook"
import { iniciarHeartbeat } from "./routes/eventosConexao"
import { iniciarSincronizacaoCalls } from "./sincronizarCalls"
import { canaisComGente } from "./eventosCall"
import { imagemRotas } from "./routes/Imagem"
import {fastifyRateLimit} from "@fastify/rate-limit"
import multipart from "@fastify/multipart"
import "dotenv/config"
const {JWT_SECRET,MODO,DISCORD_CLIENT_ID,DISCORD_CLIENT_SECRET,LIVEKIT_API_KEY,LIVEKIT_API_SECRET,LIVEKIT_URL} = process.env;

if(!JWT_SECRET || !MODO || !DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    throw new Error("FALTANDO .ENV DO APP");
}

// atrás do Caddy da VPS (docker-compose.producao.yml): o IP de quem acessa vem no X-Forwarded-For,
// senão todo mundo chegaria com o IP do Caddy e dividiria o mesmo limite de requisições
const app = fastify({ trustProxy: process.env.TRUST_PROXY === "true" }).withTypeProvider<TypeBoxTypeProvider>();

app.register(swagger, {
    openapi: {
        info: { title: "Liberdade API", version: "1.0.0" },
        components: {
            securitySchemes: {
                bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
            },
        },
        security: [{ bearerAuth: [] }], // aplica em todas as rotas
    },
})
app.register(swaggerUi, {routePrefix: "/docs"});

app.register(fastifyRateLimit, {
    global:true,
    max: 100,
    timeWindow:"1 minute",
    keyGenerator: (req) => (req.headers["cf-connecting-ip"] as string | undefined ?? req.ip),
    errorResponseBuilder: (req,context) => ({
        statusCode: context.statusCode,
        mensagem: `Muitas requisições. Tente de novo em ${context.after}.`
    })
})

app.register(fastifyWebsocket);

app.addContentTypeParser(
    "application/webhook+json",
    { parseAs: "string" },
    (_req, body, done) => done(null, body),
);

app.register(multipart,{
    attachFieldsToBody:true,
    limits: {
        fileSize: 4 * 1024 * 1024,
        files:1
    }
})

app.register(fastifyJwt, {secret:JWT_SECRET, cookie: {cookieName: "authToken",signed:false} ,sign: {expiresIn: "7d"}});

app.register(fastifyCookie, {parseOptions: {path: "/",secure: MODO === "development" ? false : true ,httpOnly: true, sameSite: "lax", maxAge: 3600 * 24 * 7}});

app.register(oauth2, {
    name:"discord",
    scope:["identify","email"],
    credentials: {
        client: {
            id: DISCORD_CLIENT_ID,
            secret: DISCORD_CLIENT_SECRET
        },
        auth: oauth2.DISCORD_CONFIGURATION
    },
    startRedirectPath: "/api/auth/discord",
    // cada um hospeda o seu site: URL_SITE no .env diz qual (sem ela, fica o do phelipedev)
    callbackUri: MODO === "development" ? "http://localhost:5173/api/auth/callback" : `${process.env.URL_SITE ?? "https://liberdade.phelipedev.com.br"}/api/auth/callback`
})
app.register(imagemRotas, {prefix:"/api"});
app.register(routeHook,{prefix:"/api"});
app.register(AuthDiscord, {prefix:"/api"});
app.register(RotasServidor, {prefix:"/api"})
app.register(routeWebSocket,{prefix:"/api"});
app.register(RotaAuth, {prefix:"/api"});
app.register(LiveKit,{prefix:"/api"});

// no container precisa ser 0.0.0.0 (HOST no compose); rodando direto, só a própria máquina acessa
app.listen({port:3000, host: process.env.HOST ?? "localhost"}, (error) => {
    console.log("ligou");
    // quem está em cada call: confere com o LiveKit de tempos em tempos (não depende só do webhook)
    iniciarSincronizacaoCalls(canaisComGente);
    // ping/pong dos WebSockets (derruba conexões mortas e mantém a presença certa)
    iniciarHeartbeat();
    if(error) {
        console.log(error);
    }
})