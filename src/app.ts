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
import { imagemRotas } from "./routes/Imagem"
import {fastifyRateLimit} from "@fastify/rate-limit"
import multipart from "@fastify/multipart"
import "dotenv/config"
const {JWT_SECRET,MODO,DISCORD_CLIENT_ID,DISCORD_CLIENT_SECRET,LIVEKIT_API_KEY,LIVEKIT_API_SECRET,LIVEKIT_URL} = process.env;

if(!JWT_SECRET || !MODO || !DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    throw new Error("FALTANDO .ENV DO APP");
}

const app = fastify().withTypeProvider<TypeBoxTypeProvider>();

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
    callbackUri: MODO === "development" ? "http://localhost:5173/api/auth/callback" : "https://liberdade.phelipedev.com.br/api/auth/callback"
})
app.register(imagemRotas, {prefix:"/api"});
app.register(routeHook,{prefix:"/api"});
app.register(AuthDiscord, {prefix:"/api"});
app.register(RotasServidor, {prefix:"/api"})
app.register(routeWebSocket,{prefix:"/api"});
app.register(RotaAuth, {prefix:"/api"});
app.register(LiveKit,{prefix:"/api"});

app.listen({port:3000}, (error) => {
    console.log("ligou");
    if(error) {
        console.log(error);
    }
})