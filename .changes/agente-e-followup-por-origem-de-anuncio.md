---
impacto: capacidade_nova
secao: adicionado
titulo: Quem chega por anúncio pode ter agente próprio e follow-up próprio
---

O roteador ganhou o campo "Quem chega por anúncio online": o agente escolhido
ali atende, desde a primeira mensagem, quem chegou por anúncio de clique para o
WhatsApp ou por página com origem de campanha. A regra vale nos primeiros 30
dias desde a chegada do contato e decide antes do assunto da mensagem; depois do
prazo a conversa volta para as intenções do roteador. Sem agente escolhido, nada
muda.

No follow-up, o gatilho "Lead criado" ganhou a opção "Só quem chegou por anúncio
online": o fluxo só começa para esses contatos. Sem marcar, o gatilho continua
valendo para todo lead novo.

A regra do roteador roda no serviço que conversa com o cliente (worker): ela só
vale depois que esse serviço for atualizado junto com o aplicativo.
