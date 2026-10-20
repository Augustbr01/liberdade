-- CreateTable
CREATE TABLE "banimento_servidor" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "servidorId" UUID NOT NULL,

    CONSTRAINT "banimento_servidor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banimento_servidor_servidorId_idx" ON "banimento_servidor"("servidorId");

-- CreateIndex
CREATE UNIQUE INDEX "banimento_servidor_usuarioId_servidorId_key" ON "banimento_servidor"("usuarioId", "servidorId");

-- AddForeignKey
ALTER TABLE "banimento_servidor" ADD CONSTRAINT "banimento_servidor_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banimento_servidor" ADD CONSTRAINT "banimento_servidor_servidorId_fkey" FOREIGN KEY ("servidorId") REFERENCES "servidores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
