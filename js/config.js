/* =========================================================================
   CONFIGURAÇÃO DO SISTEMA — Estoque de Marketing Sapion
   ========================================================================= */

window.APP_CONFIG = {
  /* Hash SHA-256 da senha de acesso (a senha em si não fica no código).
     Senha atual: definida pelo marketing (veja o README).
     Para trocar a senha, gere o SHA-256 da nova senha (instruções no README)
     e cole o resultado abaixo. */
  senhaHash: "b9d05b97c87057e57bcc46696a0c1dd416fe4eabdd045d4ef81de66fd81e0367",

  /* Banco de dados compartilhado (Supabase — gratuito).
     Deixe em branco para salvar os dados apenas neste navegador.
     Para que toda a equipe veja os mesmos dados, siga o passo a passo do README
     e preencha os dois campos abaixo.
     supabaseUrl: o "Project URL" (ex.: https://abcdxyz.supabase.co)
     supabaseAnonKey: a chave "publishable" (começa com sb_publishable_) ou a antiga chave "anon public".
     Nunca use aqui a chave "secret" nem a "service_role". */
  supabaseUrl: "https://saxwcnsdhjbkobouxzlk.supabase.co",
  supabaseAnonKey: "sb_publishable_hvwDOX-XGfpHGaIkR4a5_A_hzZ18eAq",

  /* Sugestões exibidas no campo "Unidade" ao cadastrar itens. */
  unidades: ["un", "cx", "pct", "kit", "rolo", "resma", "par"],
};
