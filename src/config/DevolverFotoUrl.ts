export function devolverAvatarUrl() {
    const indice = Math.floor((Math.random() * 6));
    return `https://cdn.discordapp.com/embed/avatars/${indice}.png`;
}