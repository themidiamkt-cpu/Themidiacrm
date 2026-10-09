---
impacto: capacidade_nova
secao: adicionado
titulo: Quem está em um funil pode ter agente próprio, e esse agente só atende o funil
---

O roteador ganhou o cartão "Quem está em um funil": para cada funil escolhido,
o agente indicado atende quem tem negócio aberto nele, antes de a origem e o
assunto da mensagem serem avaliados. Negócio ganho ou perdido não conta.

O agente indicado ali passa a atender só quem está no funil. Se a reserva, uma
intenção ou a origem de anúncio apontarem para ele num contato de fora, ele não
responde. Na origem de anúncio a regra é pulada e o assunto decide; nos outros
casos a conversa fica sem resposta automática.

A campanha que criou a conversa continua valendo acima desta regra. Sem funil
escolhido, nada muda.

A regra roda no serviço que conversa com o cliente (worker): ela só vale depois
que esse serviço for atualizado junto com o aplicativo.
