import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { DiscordUser } from "../interface/InterfacePayloadDiscord";
import {prisma} from "../../lib/prisma"
import { devolverAvatarUrl } from "../config/DevolverFotoUrl";
export const AuthDiscord: (FastifyPluginAsyncTypebox) = async (fastify) => {

    const {MODO} = process.env;

    if(!MODO) {
        throw new Error("AUTH.TS SEM .ENV");
    }

    fastify.get("/auth/callback", async (req, rep) => {
        const { token } = await fastify.discord.getAccessTokenFromAuthorizationCodeFlow(req);

        const res = await fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${token.access_token}` },
        });

        const discord = await res.json() as DiscordUser;

        if (!discord) {
            return rep.code(404).send({ mensagem: "Erro ao validar usuário do discord!" });
        }

        const user = await prisma.usuario.upsert({
            where: { discordId: discord.id },
            update: {
            },
            create: {
                discordId: discord.id,
                nome: discord.username,
                email: discord.email ?? null,
                avatarUrl: devolverAvatarUrl()
            }
        })

        const tokenPayload = fastify.jwt.sign({ id: user.id });
        console.log(tokenPayload);

        return rep.setCookie("authToken", tokenPayload, {
            path: "/",
            httpOnly: true,
            secure: MODO === "development" ? false : true,
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 7
        }).redirect("/");
    })
}
