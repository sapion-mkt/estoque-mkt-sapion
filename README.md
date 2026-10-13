# Estoque de Marketing · Sapion

Sistema simples para o setor de marketing da Sapion controlar o estoque dos materiais de marketing, organizados em **kits** e **itens**.

Construído com o **Sapion Design System**: cores, tipografia Sora e Open Sans, raios e sombras da marca, logos oficiais.

## O que o sistema faz

- **Acesso com senha de administrador.** A senha é pedida sempre que o navegador ou a aba é aberta. O botão "Sair" fica no menu ⋮.
- **Primeira tela: situação dos kits.** Mostra cada kit com a quantidade de cada item, os alertas de estoque baixo ou esgotado e **quantos kits completos dá para montar** com o estoque atual.
- **Aba Lançamentos.** Últimos lançamentos com filtros por período, tipo, kit e busca livre.
- **Entradas e saídas**, sempre com **descrição obrigatória** do motivo. É possível lançar:
  - por **item** (ex.: chegaram 200 canetas);
  - por **kit completo** (ex.: saíram 20 kits para um seminário). Cada item do kit é baixado de acordo com a quantidade por kit.
- **Ajuste manual de quantidade** (contagem física, perda, avaria), com motivo obrigatório.
- **Estorno** de um lançamento feito por engano. O estorno gera um novo lançamento que desfaz o anterior, com motivo, e o histórico fica preservado.
- **Cadastro livre de kits e itens:** criar, editar, duplicar, excluir e mover itens entre kits. O histórico de lançamentos é mantido mesmo depois de excluir.
- **Planilha Excel (.xlsx)** com o estoque disponível e os lançamentos da **última semana, dos últimos 30 dias, dos últimos 90 dias ou do último ano**. A planilha tem 4 abas: Resumo, Estoque atual, Kits e Lançamentos.
- **Backup e restauração** dos dados em arquivo `.json`.

### Campos de cada item

| Campo | Para que serve |
|---|---|
| Qtd. por kit | Quantas unidades vão em cada kit montado. Use 0 para item opcional, que não entra na conta de kits completos. |
| Estoque mínimo | O item fica como "Estoque baixo" quando a quantidade chega a esse número. Use 0 para não receber alerta. |
| Quantidade inicial | Só aparece ao cadastrar. Vira uma entrada no histórico. |

Depois do cadastro, a quantidade só muda por **lançamento** ou **ajuste**. Assim todo movimento fica registrado e explicado.

---

## Como publicar no GitHub (GitHub Pages)

O sistema é um site estático: HTML, CSS e JavaScript, sem instalação e sem servidor próprio.

1. Crie um repositório novo no GitHub, por exemplo `estoque-marketing-sapion`.
2. Clique em **Add file → Upload files** e arraste **todo o conteúdo desta pasta**: `index.html`, `css/`, `js/`, `assets/`, `supabase/`, `README.md` e `.nojekyll`. Clique em **Commit changes**.
3. Vá em **Settings → Pages**. Em "Branch", escolha `main` e a pasta `/ (root)`. Clique em **Save**.
4. Em 1 ou 2 minutos o endereço aparece na mesma página, algo como `https://SEU-USUARIO.github.io/estoque-marketing-sapion/`.

> Para testar no computador antes de subir, abra o `index.html` no navegador (Chrome ou Edge).

---

## Onde os dados ficam salvos

Antes de começar a usar de verdade, escolha um dos dois modos.

### Modo 1: neste navegador (padrão, já funciona)

Sem configurar nada, os dados ficam salvos **no navegador do computador** que está usando o sistema.

- Bom para **uma pessoa, em um computador**.
- Outro computador ou outro navegador **não** vê os mesmos dados.
- Limpar os dados de navegação apaga o estoque. Use **⋮ → Backup e restauração → Baixar backup** com frequência.

### Modo 2: banco compartilhado (recomendado para a equipe)

Com o **Supabase** (gratuito), todos que acessam o endereço veem e editam os **mesmos dados**, em qualquer computador ou celular.

1. Crie uma conta em [supabase.com](https://supabase.com) e clique em **New project**. Escolha um nome e uma senha de banco e use a região **South America (São Paulo)**.
2. No projeto, abra **SQL Editor → New query**, cole todo o conteúdo do arquivo [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Copie dois dados do projeto (botão **Connect** no topo, ou **Project Settings → API Keys / Data API**):
   - **Project URL** (ex.: `https://abcdxyz.supabase.co`)
   - a chave **publishable** (começa com `sb_publishable_`) ou, em projetos antigos, a chave **anon public**. Nunca use a chave **secret** nem a **service_role**.
4. No GitHub, abra o arquivo `js/config.js`, clique no lápis (editar) e preencha:
   ```js
   supabaseUrl: "https://abcdxyz.supabase.co",
   supabaseAnonKey: "cole-aqui-a-chave-anon-public",
   ```
   Clique em **Commit changes**. Em 1 ou 2 minutos o site atualiza.
5. Pronto: no topo do sistema vai aparecer **"Banco compartilhado"**.

**Já usou o Modo 1 e quer levar os dados?** Antes de configurar o Supabase, baixe um backup (⋮ → Backup e restauração). Depois de configurar, entre de novo e use **Restaurar a partir de um backup**.

No modo compartilhado, o sistema busca os dados mais recentes antes de cada lançamento, ao voltar para a aba e a cada minuto.

---

## Senha de acesso

A senha atual foi definida pelo marketing. O código guarda apenas o **hash SHA-256** da senha (`senhaHash` em `js/config.js`), nunca a senha em texto.

**Para trocar a senha:**

1. Gere o SHA-256 da nova senha. Por exemplo, no PowerShell do Windows:
   ```powershell
   $s = "NOVA-SENHA-AQUI"; -join ([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($s)) | % { $_.ToString("x2") })
   ```
   Ou em qualquer gerador de SHA-256 confiável.
2. Cole o resultado (64 caracteres) em `senhaHash`, no arquivo `js/config.js`.

---

## Segurança: o que saber

Este é um sistema **simples**, pensado para uso interno do marketing:

- A senha impede o acesso pela tela do sistema, mas a verificação acontece no navegador. Quem tiver conhecimento técnico e acesso ao código consegue contorná-la.
- No modo compartilhado, a chave `anon` do Supabase fica visível no código do site. Com ela, alguém com conhecimento técnico poderia ler ou alterar os dados direto no banco.
- Por isso: **não guarde dados sensíveis** (pessoais, financeiros) no sistema, e **compartilhe o endereço só com a equipe**. A página já pede aos buscadores para não indexá-la (`noindex`).
- Se o repositório for público, o código (inclusive o `config.js`) também fica público. Para um controle mais forte, o caminho é ativar o login por e-mail do Supabase (Supabase Auth) e restringir as políticas do banco aos usuários autenticados.

---

## Estrutura dos arquivos

```
index.html            página do sistema
css/tokens.css        tokens do Sapion Design System (cores, tipografia, espaçamentos)
css/styles.css        componentes e telas
js/config.js          configurações: senha (hash) e Supabase
js/store.js           onde os dados são salvos (navegador ou Supabase)
js/app.js             telas, lançamentos, cadastros, planilha e backup
assets/logos/         logos oficiais da Sapion
assets/fonts/         fonte Sora (marca)
supabase/schema.sql   script para criar o banco compartilhado
```

Bibliotecas carregadas por CDN: [Lucide](https://lucide.dev) (ícones, MIT) e [SheetJS](https://sheetjs.com) (planilhas Excel, Apache-2.0). O sistema precisa de internet para carregar essas bibliotecas e a fonte Open Sans.
